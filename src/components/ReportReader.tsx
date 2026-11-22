"use client";

import React, { useCallback, useRef, useState } from "react";
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  FileSpreadsheet,
  FileUp,
  Loader2,
  Search,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatBrCurrency, type ParsedReport } from "@/lib/report-parser";
import { cn } from "@/lib/utils";
import { relatoriosService } from "@/services/relatorios.service";

export function ReportReader() {
  const [report, setReport] = useState<ParsedReport | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<{
    type: "success" | "info";
    message: string;
  } | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const processReportPdf = useCallback(async (file: File) => {
    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      setError("Formato inválido. Por favor, selecione um arquivo PDF (.pdf).");
      return;
    }

    setError(null);
    setSaveFeedback(null);
    setLoading(true);
    setFileName(file.name);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/parse-report-pdf", {
        method: "POST",
        body: formData,
      });

      const data = (await res.json()) as {
        report?: ParsedReport;
        totalPages?: number;
        error?: string;
      };

      if (!res.ok || !data.report) {
        throw new Error(data.error || "Erro ao ler o relatório em PDF.");
      }

      const parsedReport = data.report;
      setReport(parsedReport);
      setTotalPages(data.totalPages ?? null);
      setSearchQuery("");

      // Salva automaticamente no banco após a leitura do PDF
      if (parsedReport.itens.length > 0) {
        setSaving(true);
        const result = await relatoriosService.saveReportItems(
          parsedReport.itens,
          parsedReport.dataIso
        );
        setSaving(false);

        if (result.error) {
          setError(result.error);
          return;
        }

        setSavedIds(new Set(result.savedIdsTransacao));

        if (result.insertedCount > 0 && result.skippedCount > 0) {
          setSaveFeedback({
            type: "success",
            message: `Relatório salvo automaticamente! ${result.insertedCount} ${
              result.insertedCount === 1
                ? "novo pagamento registrado"
                : "novos pagamentos registrados"
            } (${result.skippedCount} já ${
              result.skippedCount === 1 ? "estava salvo" : "estavam salvos"
            }).`,
          });
        } else if (result.insertedCount > 0) {
          setSaveFeedback({
            type: "success",
            message: `Relatório salvo automaticamente! ${result.insertedCount} ${
              result.insertedCount === 1
                ? "pagamento registrado"
                : "pagamentos registrados"
            } com sucesso.`,
          });
        } else {
          setSaveFeedback({
            type: "info",
            message: `Todos os ${result.skippedCount} pagamentos deste relatório já estavam salvos no sistema.`,
          });
        }
      }
    } catch (err) {
      setReport(null);
      setTotalPages(null);
      setSavedIds(new Set());
      setError(
        err instanceof Error
          ? err.message
          : "Erro inesperado ao processar o PDF."
      );
    } finally {
      setLoading(false);
      setSaving(false);
    }
  }, []);

  const handleCopyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(key);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleCopyAllTsv = () => {
    if (!report) return;
    const header = ["Data", "Hora", "Pagador", "Valor", "ID da Transação"].join(
      "\t"
    );
    const rows = filteredItems.map((item) =>
      [
        item.dataCurta || report.dataCurta || "",
        item.horaTransacao,
        item.nomeRelatorio,
        item.valor.toFixed(2).replace(".", ","),
        item.idTransacao,
      ].join("\t")
    );
    void handleCopyText("all-tsv", [header, ...rows].join("\n"));
  };

  const filteredItems = report
    ? report.itens.filter((item) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        return (
          item.nomeRelatorio.toLowerCase().includes(q) ||
          item.idTransacao.toLowerCase().includes(q) ||
          item.horaTransacao.includes(q) ||
          item.valorFormatado.toLowerCase().includes(q)
        );
      })
    : [];

  const filteredTotal = filteredItems.reduce(
    (acc, item) => Math.round((acc + item.valor) * 100) / 100,
    0
  );

  const countMatchesExpected =
    report && report.quantidadeEsperada === report.quantidadeExtraida;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 pb-16">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void processReportPdf(file);
          e.target.value = "";
        }}
      />

      {/* Page Title */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Leitor de Relatórios PIX
          </h1>
          <p className="text-sm text-muted-foreground">
            Envie o PDF do relatório diário para registrar automaticamente os
            pagamentos recebidos.
          </p>
        </div>

        {report && (
          <Button
            type="button"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || saving}
          >
            {loading || saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <FileUp className="h-4 w-4" />
                Enviar outro PDF
              </>
            )}
          </Button>
        )}
      </div>

      {/* Upload Dropzone Card (hidden once a PDF has been read) */}
      {!report && (
        <Card>
          <CardContent className="p-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void processReportPdf(file);
              }}
              onClick={() =>
                !loading && !saving && fileInputRef.current?.click()
              }
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors",
                isDragging
                  ? "border-primary bg-primary/10"
                  : "border-input bg-secondary/50 hover:border-primary/60 hover:bg-secondary",
                (loading || saving) && "pointer-events-none opacity-60"
              )}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                {loading || saving ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-5 w-5" />
                )}
              </div>

              <p className="text-sm font-semibold text-foreground">
                {loading
                  ? "Lendo transações do PDF..."
                  : saving
                  ? "Salvando pagamentos do relatório..."
                  : fileName
                  ? `Arquivo carregado: ${fileName}`
                  : "Clique para selecionar ou arraste o PDF do relatório aqui"}
              </p>

              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={loading || saving}
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                <FileUp className="h-4 w-4" />
                Selecionar arquivo PDF
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {saveFeedback && (
        <div
          className={cn(
            "flex items-start gap-2.5 rounded-xl border p-3.5 text-sm",
            saveFeedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-border bg-secondary text-foreground"
          )}
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span>{saveFeedback.message}</span>
        </div>
      )}

      {/* Extracted Report Summary + Table */}
      {report && (
        <div className="space-y-6">
          {/* Summary Metrics */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardDescription className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider">
                  <Calendar className="h-3.5 w-3.5 text-primary" />
                  Data do Relatório
                </CardDescription>
                <CardTitle className="text-2xl font-bold text-foreground">
                  {report.dataCurta || "—"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <p className="text-xs text-muted-foreground">
                  {report.diaSemana ? `${report.diaSemana}, ` : ""}
                  {report.dataCompleta || "Data não identificada"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-4 pb-2">
                <CardDescription className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider">
                  <User className="h-3.5 w-3.5 text-primary" />
                  Vendedor
                </CardDescription>
                <CardTitle className="truncate text-2xl font-bold text-foreground">
                  {report.vendedorNome || "—"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <p className="truncate text-xs text-muted-foreground">
                  {report.vendedorEmail || "E-mail não informado"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-4 pb-2">
                <CardDescription className="flex items-center justify-between text-xs font-medium uppercase tracking-wider">
                  <span>Quantidade de PIX</span>
                  {countMatchesExpected ? (
                    <Badge variant="success" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Completo
                    </Badge>
                  ) : (
                    <Badge variant="warning">Verificar</Badge>
                  )}
                </CardDescription>
                <CardTitle className="text-2xl font-bold text-foreground">
                  {report.quantidadeExtraida}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    / {report.quantidadeEsperada} PIX
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <p className="text-xs text-muted-foreground">
                  {totalPages
                    ? `Lido de ${totalPages} ${
                        totalPages === 1 ? "página" : "páginas"
                      }`
                    : "Pagamentos identificados"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-4 pb-2">
                <CardDescription className="text-xs font-medium uppercase tracking-wider">
                  Total Recebido
                </CardDescription>
                <CardTitle className="text-2xl font-bold text-primary">
                  {report.totalRecebidoFormatado}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <p className="text-xs text-muted-foreground">
                  Soma dos {report.quantidadeExtraida} pagamentos
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Transactions Table Card */}
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border bg-card p-5">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <CardTitle className="text-base">
                    PIX de clientes do vendedor — {report.quantidadeEsperada} PIX
                  </CardTitle>
                  <CardDescription className="mt-0.5 text-xs">
                    Lista de pagamentos extraídos do relatório diário.
                  </CardDescription>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-full sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar pagador, hora ou valor..."
                      className="h-9 pl-9 text-xs"
                    />
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopyAllTsv}
                    disabled={filteredItems.length === 0}
                  >
                    {copiedId === "all-tsv" ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copiar tabela
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <th className="w-12 px-3 py-3 text-center">#</th>
                      <th className="w-24 px-3 py-3">Data</th>
                      <th className="w-20 px-3 py-3">Hora</th>
                      <th className="px-3 py-3">Pagador</th>
                      <th className="w-32 px-3 py-3 text-right">Valor</th>
                      <th className="px-3 py-3">ID da Transação</th>
                      <th className="w-24 px-3 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredItems.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-8 text-center text-sm text-muted-foreground"
                        >
                          Nenhum pagamento encontrado para a busca informada.
                        </td>
                      </tr>
                    ) : (
                      filteredItems.map((item) => {
                        const isSaved =
                          Boolean(item.idTransacao) &&
                          savedIds.has(item.idTransacao);

                        return (
                          <tr
                            key={`${item.index}-${item.idTransacao}`}
                            className="transition-colors hover:bg-muted/40"
                          >
                            <td className="px-3 py-3 text-center font-mono text-xs text-muted-foreground">
                              {item.index}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3">
                              <Badge variant="secondary" className="font-mono">
                                {item.dataCurta || report.dataCurta || "—"}
                              </Badge>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 font-mono text-xs font-medium text-foreground">
                              {item.horaTransacao}
                            </td>
                            <td className="px-3 py-3 font-medium text-foreground">
                              {item.nomeRelatorio}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-sm font-semibold text-primary">
                              {item.valorFormatado}
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center justify-between gap-2">
                                <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
                                  {item.idTransacao}
                                </code>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleCopyText(
                                      `row-${item.index}`,
                                      item.idTransacao
                                    )
                                  }
                                  className="rounded-lg p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                                  title="Copiar ID da transação"
                                >
                                  {copiedId === `row-${item.index}` ? (
                                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-center">
                              {isSaved ? (
                                <Badge variant="success" className="gap-1">
                                  <Check className="h-3 w-3" />
                                  Salvo
                                </Badge>
                              ) : saving ? (
                                <Badge variant="secondary">Salvando...</Badge>
                              ) : (
                                <Badge variant="outline">Pendente</Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {filteredItems.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/40 font-semibold text-foreground">
                        <td
                          colSpan={4}
                          className="px-3 py-3 text-right text-xs uppercase tracking-wider text-muted-foreground"
                        >
                          Total ({filteredItems.length}{" "}
                          {filteredItems.length === 1 ? "pagamento" : "pagamentos"})
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-sm font-bold text-primary">
                          {formatBrCurrency(filteredTotal)}
                        </td>
                        <td colSpan={2} className="px-3 py-3" />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
