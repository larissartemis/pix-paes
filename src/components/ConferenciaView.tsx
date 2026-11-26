"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Filter,
  Loader2,
  RotateCcw,
  Search,
  Share2,
  Sparkles,
  XCircle,
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
import { ReportCalendarPicker } from "@/components/ui/report-calendar-picker";
import { SelectList } from "@/components/ui/select-list";
import { formatBrCurrency } from "@/lib/report-parser";
import { cn } from "@/lib/utils";
import {
  getLatestUploadedReportDate,
  getRelatoriosByDate,
  listAvailableReportDates,
  reconcilePendingWithReport,
  updateConciliado,
  type RelatorioRow,
} from "@/services/relatorios.service";

type SortField = "hora" | "pagador" | "valor" | "conciliado";
type SortDirection = "asc" | "desc";

const SORT_OPTIONS = [
  { value: "", label: "Ordenar por" },
  { value: "hora:asc", label: "Hora (mais cedo → tarde)" },
  { value: "hora:desc", label: "Hora (mais tarde → cedo)" },
  { value: "pagador:asc", label: "Pagador (A → Z)" },
  { value: "pagador:desc", label: "Pagador (Z → A)" },
  { value: "valor:desc", label: "Valor (maior → menor)" },
  { value: "valor:asc", label: "Valor (menor → maior)" },
  { value: "conciliado:asc", label: "Conferido (Não → Sim)" },
  { value: "conciliado:desc", label: "Conferido (Sim → Não)" },
];

function formatIsoDateBr(dateIso: string | null): string {
  if (!dateIso) return "—";
  const parts = dateIso.split("-");
  if (parts.length !== 3) return dateIso;
  const [yyyy, mm, dd] = parts;
  return `${dd}/${mm}/${yyyy}`;
}

function formatIsoDateShort(dateIso: string | null): string {
  if (!dateIso) return "—";
  const parts = dateIso.split("-");
  if (parts.length !== 3) return dateIso;
  const [, mm, dd] = parts;
  return `${dd}/${mm}`;
}

export function ConferenciaView() {
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [rows, setRows] = useState<RelatorioRow[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [matching, setMatching] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [matchFeedback, setMatchFeedback] = useState<{
    type: "success" | "info";
    message: string;
  } | null>(null);

  // Filters, Sorting & Pagination — Default filter: "Conferido: Não" selected
  const [searchQuery, setSearchQuery] = useState("");
  const [includeConferidoSim, setIncludeConferidoSim] = useState(false);
  const [includeConferidoNao, setIncludeConferidoNao] = useState(true);
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const [sortOption, setSortOption] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [copiedSummary, setCopiedSummary] = useState(false);

  const filterDropdownRef = useRef<HTMLDivElement | null>(null);

  // Close checkbox dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        filterDropdownRef.current &&
        !filterDropdownRef.current.contains(event.target as Node)
      ) {
        setFilterDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadRowsForDate = useCallback(async (dateIso: string) => {
    if (!dateIso) {
      setRows([]);
      return;
    }
    setLoadingRows(true);
    setError(null);
    const { data, error: fetchError } = await getRelatoriosByDate(dateIso);
    if (fetchError) {
      setError(`Não foi possível carregar os registros: ${fetchError}`);
      setRows([]);
    } else {
      setRows(data);
    }
    setCurrentPage(1);
    setLoadingRows(false);
  }, []);

  const runAutoMatch = useCallback(
    async (targetDateIso: string, silentIfZero = false) => {
      setMatching(true);
      setError(null);

      const result = await reconcilePendingWithReport(targetDateIso);
      setMatching(false);

      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.matchedCount > 0) {
        const details: string[] = [];
        if (result.matchedSameDateCount > 0) {
          details.push(`${result.matchedSameDateCount} na mesma data`);
        }
        if (result.matchedFutureDateCount > 0) {
          details.push(
            `${result.matchedFutureDateCount} em data posterior (cliente pagou depois)`
          );
        }
        setMatchFeedback({
          type: "success",
          message: `${result.matchedCount} ${
            result.matchedCount === 1
              ? "novo comprovante vinculado automaticamente"
              : "novos comprovantes vinculados automaticamente"
          }${details.length > 0 ? ` (${details.join(", ")})` : ""}!`,
        });
      } else if (!silentIfZero) {
        setMatchFeedback({
          type: "info",
          message:
            "Busca concluída: nenhum novo comprovante pendente encontrado para vincular a este relatório ou datas futuras.",
        });
      }
    },
    []
  );

  // Load default date (from URL `?data=YYYY-MM-DD` or most recently uploaded PDF report) + available dates
  const initConferencia = useCallback(async () => {
    setLoadingInitial(true);
    setError(null);

    const params =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : null;
    const requestedDate = params?.get("data")?.trim() || "";
    const shouldAutoMatch = params?.get("auto_match") === "1";

    const [{ date: latestDate, error: latestErr }, { dates }] =
      await Promise.all([
        getLatestUploadedReportDate(),
        listAvailableReportDates(),
      ]);

    if (latestErr) {
      setError(`Erro ao buscar último relatório: ${latestErr}`);
      setLoadingInitial(false);
      return;
    }

    setAvailableDates(dates);

    const initialDate = requestedDate || latestDate || dates[0] || "";
    setSelectedDate(initialDate);

    if (initialDate) {
      await runAutoMatch(initialDate, !shouldAutoMatch);
      await loadRowsForDate(initialDate);
    }
    setLoadingInitial(false);
  }, [loadRowsForDate, runAutoMatch]);

  useEffect(() => {
    void initConferencia();
  }, [initConferencia]);

  // Reset to page 1 when filters/search/sort/pageSize change
  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchQuery,
    includeConferidoSim,
    includeConferidoNao,
    sortOption,
    pageSize,
  ]);

  const handleDateChange = async (nextDate: string) => {
    setSelectedDate(nextDate);
    setMatchFeedback(null);
    if (nextDate) {
      await loadRowsForDate(nextDate);
    } else {
      setRows([]);
    }
  };

  const handleToggleConferido = async (row: RelatorioRow) => {
    setUpdatingId(row.id);
    const nextValue = !row.conciliado;
    const { data, error: updateError } = await updateConciliado(
      row.id,
      nextValue
    );

    if (updateError) {
      setError(`Erro ao atualizar status: ${updateError}`);
    } else if (data) {
      setRows((prev) =>
        prev.map((item) => (item.id === row.id ? data : item))
      );
    }
    setUpdatingId(null);
  };

  const currentSortField: SortField = sortOption
    ? (sortOption.split(":")[0] as SortField)
    : "hora";
  const currentSortDirection: SortDirection = sortOption
    ? (sortOption.split(":")[1] as SortDirection)
    : "asc";

  const handleSort = (field: SortField) => {
    if (sortOption && currentSortField === field) {
      const nextDir: SortDirection =
        currentSortDirection === "asc" ? "desc" : "asc";
      setSortOption(`${field}:${nextDir}`);
    } else {
      setSortOption(`${field}:asc`);
    }
  };

  const allStatusSelected = includeConferidoSim && includeConferidoNao;
  const isDefaultStatusFilter =
    !includeConferidoSim && includeConferidoNao;

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    !isDefaultStatusFilter ||
    Boolean(sortOption);

  const handleResetFilters = () => {
    setSearchQuery("");
    setIncludeConferidoSim(false);
    setIncludeConferidoNao(true);
    setSortOption("");
    setCurrentPage(1);
  };

  const handleCopyPendingSummary = async () => {
    const pendingRows = rows.filter((r) => !r.conciliado);
    const header = `*COMPROVANTES PENDENTES - ${formatIsoDateBr(selectedDate)}*`;
    const lines = pendingRows.map(
      (r) => `${r.nome_relatorio} - ${formatBrCurrency(Number(r.valor))}`
    );
    const text = [header, ...lines].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  // Filtered and sorted rows
  const processedRows = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    const filtered = rows.filter((row) => {
      if (row.conciliado && !includeConferidoSim) return false;
      if (!row.conciliado && !includeConferidoNao) return false;

      if (query) {
        const matchName = row.nome_relatorio.toLowerCase().includes(query);
        const matchHora = (row.hora_transacao || "")
          .toLowerCase()
          .includes(query);
        const matchId = (row.id_transacao || "").toLowerCase().includes(query);
        const matchVal = formatBrCurrency(Number(row.valor))
          .toLowerCase()
          .includes(query);
        if (!matchName && !matchHora && !matchId && !matchVal) {
          return false;
        }
      }

      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;

      if (currentSortField === "hora") {
        comparison = (a.hora_transacao || "").localeCompare(
          b.hora_transacao || ""
        );
      } else if (currentSortField === "pagador") {
        comparison = a.nome_relatorio.localeCompare(b.nome_relatorio, "pt-BR");
      } else if (currentSortField === "valor") {
        comparison = Number(a.valor) - Number(b.valor);
      } else if (currentSortField === "conciliado") {
        comparison = Number(a.conciliado) - Number(b.conciliado);
      }

      return currentSortDirection === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [
    rows,
    searchQuery,
    includeConferidoSim,
    includeConferidoNao,
    currentSortField,
    currentSortDirection,
  ]);

  // Pagination calculations
  const totalFilteredCount = processedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalFilteredCount / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalFilteredCount);
  const paginatedRows = processedRows.slice(startIndex, endIndex);

  // Metrics for current date
  const totalCount = rows.length;
  const conferidosCount = rows.filter((r) => r.conciliado).length;
  const pendentesCount = totalCount - conferidosCount;
  const totalValor = rows.reduce((acc, r) => acc + Number(r.valor || 0), 0);
  const totalConferidoValor = rows
    .filter((r) => r.conciliado)
    .reduce((acc, r) => acc + Number(r.valor || 0), 0);
  const filteredTotalValor = processedRows.reduce(
    (acc, r) => acc + Number(r.valor || 0),
    0
  );

  function renderSortIcon(field: SortField) {
    if (!sortOption || currentSortField !== field) {
      return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />;
    }
    return currentSortDirection === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 text-primary" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-primary" />
    );
  }

  const filterButtonLabel = allStatusSelected
    ? "Todos"
    : includeConferidoSim
    ? "Conferido: Sim"
    : includeConferidoNao
    ? "Conferido: Não"
    : "Nenhum";

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 pb-16">
      {/* Header + Calendar Selector + Summary Metrics Card */}
      <Card>
        <CardHeader className="border-b border-border p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base font-bold uppercase tracking-wide text-primary">
              Conferência de PIX
            </CardTitle>

            <ReportCalendarPicker
              value={selectedDate}
              highlightedDates={availableDates}
              onChange={(nextDate) => void handleDateChange(nextDate)}
            />
          </div>
        </CardHeader>

        {!loadingInitial && selectedDate && rows.length > 0 && (
          <CardContent className="p-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-border bg-secondary/40 p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Conferidos
                </p>
                <p className="mt-1.5 text-2xl font-bold text-emerald-700">
                  {conferidosCount}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    / {totalCount}
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {totalCount > 0
                    ? `${Math.round((conferidosCount / totalCount) * 100)}% conferido`
                    : "0% conferido"}
                </p>
              </div>

              <div className="rounded-xl border border-border bg-secondary/40 p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Pendentes
                </p>
                <p className="mt-1.5 text-2xl font-bold text-amber-700">
                  {pendentesCount}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Aguardando conferência
                </p>
              </div>

              <div className="rounded-xl border border-border bg-secondary/40 p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Valor Total Conferido
                </p>
                <p className="mt-1.5 text-2xl font-bold text-emerald-700">
                  {formatBrCurrency(totalConferidoValor)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Soma dos {conferidosCount} pagamentos conferidos
                </p>
              </div>

              <div className="rounded-xl border border-border bg-secondary/40 p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Valor Total
                </p>
                <p className="mt-1.5 text-2xl font-bold text-primary">
                  {formatBrCurrency(totalValor)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Soma dos {totalCount} pagamentos
                </p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Alerts positioned right before the payments table */}
      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {matchFeedback && (
        <div
          className={cn(
            "flex items-start gap-2.5 rounded-xl border p-3.5 text-sm",
            matchFeedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-border bg-secondary text-foreground"
          )}
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span>{matchFeedback.message}</span>
        </div>
      )}

      {loadingInitial ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <p className="text-sm font-medium">
              Carregando último relatório enviado...
            </p>
          </CardContent>
        </Card>
      ) : !selectedDate || (rows.length === 0 && !loadingRows) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <FileSpreadsheet className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">
                {selectedDate
                  ? `Nenhum registro encontrado para ${formatIsoDateBr(selectedDate)}`
                  : "Nenhum relatório enviado ainda"}
              </h2>
              <p className="max-w-md text-xs text-muted-foreground">
                Envie um PDF na tela de Relatórios para que os pagamentos do dia
                apareçam automaticamente aqui para conferência.
              </p>
            </div>
            <Link href="/relatorios">
              <Button size="sm">Ir para Relatórios</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        /* Filters & Table Card */
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border bg-card p-5">
            <div className="flex flex-col gap-4">
              <CardTitle className="text-base font-bold uppercase tracking-wide text-primary">
                Pagamentos do dia {formatIsoDateBr(selectedDate)}
              </CardTitle>

              {/* Filter Bar: [Filter Checkbox List] [Search Input] [Sort SelectList] [Reset Icon] [Auto-Match Sparkles Icon] */}
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                {/* Status Checkboxes Dropdown with Filter Icon */}
                <div ref={filterDropdownRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setFilterDropdownOpen((v) => !v)}
                    className={cn(
                      "inline-flex h-9 items-center gap-2 rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground shadow-xs transition-colors hover:bg-accent",
                      !allStatusSelected &&
                        "border-primary/50 bg-primary/5 text-primary"
                    )}
                    aria-expanded={filterDropdownOpen}
                    aria-haspopup="true"
                  >
                    <Filter className="h-3.5 w-3.5 text-primary" />
                    <span>{filterButtonLabel}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>

                  {filterDropdownOpen && (
                    <div className="absolute left-0 top-full z-20 mt-1.5 w-56 rounded-xl border border-border bg-card p-2 shadow-lg">
                      <label className="flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium text-foreground hover:bg-accent">
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={allStatusSelected}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setIncludeConferidoSim(checked);
                              setIncludeConferidoNao(checked);
                            }}
                            className="h-4 w-4 rounded border-input accent-primary"
                          />
                          <span>Todos</span>
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {totalCount}
                        </span>
                      </label>

                      <div className="my-1 border-t border-border" />

                      <label className="flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium text-foreground hover:bg-accent">
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={includeConferidoSim}
                            onChange={(e) =>
                              setIncludeConferidoSim(e.target.checked)
                            }
                            className="h-4 w-4 rounded border-input accent-primary"
                          />
                          <span>Conferido: Sim</span>
                        </span>
                        <span className="text-[11px] text-emerald-700">
                          {conferidosCount}
                        </span>
                      </label>

                      <label className="flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium text-foreground hover:bg-accent">
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={includeConferidoNao}
                            onChange={(e) =>
                              setIncludeConferidoNao(e.target.checked)
                            }
                            className="h-4 w-4 rounded border-input accent-primary"
                          />
                          <span>Conferido: Não</span>
                        </span>
                        <span className="text-[11px] text-amber-700">
                          {pendentesCount}
                        </span>
                      </label>
                    </div>
                  )}
                </div>

                {/* Search Input */}
                <div className="relative min-w-52 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar por pagador, hora ou valor..."
                    className="h-9 pl-9 text-xs"
                  />
                </div>

                {/* Sort SelectList ("Ordenar por" default) */}
                <SelectList
                  value={sortOption}
                  ariaLabel="Ordenar por"
                  placeholder="Ordenar por"
                  options={SORT_OPTIONS}
                  onChange={(val) => setSortOption(val)}
                  className="h-9 min-w-48 bg-background"
                  menuClassName="w-56 right-0 left-auto"
                />

                {/* Reset Filters Icon Button */}
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={!hasActiveFilters}
                  onClick={handleResetFilters}
                  title="Redefinir filtros"
                  aria-label="Redefinir filtros"
                  className="h-9 w-9 shrink-0"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>

                {/* Auto-Match Pending Receipts Button (Sparkles Icon) */}
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={matching || loadingRows || !selectedDate}
                  onClick={async () => {
                    if (!selectedDate) return;
                    await runAutoMatch(selectedDate, false);
                    await loadRowsForDate(selectedDate);
                  }}
                  title={`Vincular comprovantes pendentes (${pendentesCount} não ${
                    pendentesCount === 1 ? "conferido" : "conferidos"
                  })`}
                  aria-label="Vincular comprovantes pendentes"
                  className="h-9 w-9 shrink-0 text-primary"
                >
                  {matching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                </Button>

                {/* Share / Copy Pending Summary Button (Share2 Icon) */}
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={loadingRows || !selectedDate || pendentesCount === 0}
                  onClick={() => void handleCopyPendingSummary()}
                  title={
                    copiedSummary
                      ? "Resumo copiado!"
                      : "Copiar resumo de comprovantes pendentes"
                  }
                  aria-label="Copiar resumo de comprovantes pendentes"
                  className="h-9 w-9 shrink-0 text-primary"
                >
                  {copiedSummary ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Share2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {loadingRows ? (
              <div className="flex items-center justify-center gap-2.5 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span>Carregando pagamentos...</span>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <th className="w-20 px-4 py-3">Data</th>
                        <th className="w-24 px-4 py-3">
                          <button
                            type="button"
                            onClick={() => handleSort("hora")}
                            className="inline-flex items-center gap-1 font-semibold uppercase tracking-wider hover:text-foreground"
                          >
                            <span>Hora</span>
                            {renderSortIcon("hora")}
                          </button>
                        </th>
                        <th className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => handleSort("pagador")}
                            className="inline-flex items-center gap-1 font-semibold uppercase tracking-wider hover:text-foreground"
                          >
                            <span>Pagador</span>
                            {renderSortIcon("pagador")}
                          </button>
                        </th>
                        <th className="w-36 px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleSort("valor")}
                            className="ml-auto inline-flex items-center gap-1 font-semibold uppercase tracking-wider hover:text-foreground"
                          >
                            <span>Valor</span>
                            {renderSortIcon("valor")}
                          </button>
                        </th>
                        <th className="w-36 px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleSort("conciliado")}
                            className="mx-auto inline-flex items-center gap-1 font-semibold uppercase tracking-wider hover:text-foreground"
                          >
                            <span>Conferido</span>
                            {renderSortIcon("conciliado")}
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {paginatedRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-4 py-10 text-center text-sm text-muted-foreground"
                          >
                            Nenhum pagamento corresponde aos filtros aplicados.
                          </td>
                        </tr>
                      ) : (
                        paginatedRows.map((row) => {
                          const isUpdating = updatingId === row.id;

                          return (
                            <tr
                              key={row.id}
                              className="transition-colors hover:bg-muted/40"
                            >
                              <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                                {formatIsoDateShort(row.data_transacao)}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground">
                                {row.hora_transacao || "—"}
                              </td>
                              <td className="px-4 py-3 text-sm font-medium text-foreground">
                                {row.nome_relatorio}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-primary">
                                {formatBrCurrency(Number(row.valor))}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-center">
                                <button
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={() =>
                                    void handleToggleConferido(row)
                                  }
                                  title="Clique para alternar entre Sim e Não"
                                  className="inline-flex items-center justify-center disabled:opacity-50"
                                >
                                  {isUpdating ? (
                                    <Badge variant="secondary" className="gap-1">
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                      ...
                                    </Badge>
                                  ) : row.conciliado ? (
                                    <Badge
                                      variant="success"
                                      className="cursor-pointer gap-1 px-3 py-1 transition hover:opacity-85"
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                      Sim
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant="warning"
                                      className="cursor-pointer gap-1 px-3 py-1 transition hover:opacity-85"
                                    >
                                      <XCircle className="h-3.5 w-3.5" />
                                      Não
                                    </Badge>
                                  )}
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    {processedRows.length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-border bg-muted/40 font-semibold text-foreground">
                          <td
                            colSpan={3}
                            className="px-4 py-3 text-right text-xs uppercase tracking-wider text-muted-foreground"
                          >
                            Total filtrado ({processedRows.length}{" "}
                            {processedRows.length === 1
                              ? "pagamento"
                              : "pagamentos"}
                            )
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-bold text-primary">
                            {formatBrCurrency(filteredTotalValor)}
                          </td>
                          <td className="px-4 py-3" />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>

                {/* Pagination Footer */}
                <div className="flex flex-col items-center justify-between gap-3 border-t border-border bg-card px-4 py-3 text-xs text-muted-foreground sm:flex-row">
                  <div className="flex items-center gap-2">
                    <span>Itens por página:</span>
                    <SelectList
                      value={String(pageSize)}
                      ariaLabel="Itens por página"
                      options={[
                        { value: "10", label: "10" },
                        { value: "25", label: "25" },
                        { value: "50", label: "50" },
                        { value: "100", label: "100" },
                      ]}
                      onChange={(val) => setPageSize(Number.parseInt(val, 10))}
                      className="min-w-16 bg-background"
                      menuClassName="w-20 bottom-full top-auto mb-1.5"
                    />
                    <span className="ml-1">
                      {totalFilteredCount === 0
                        ? "0 de 0"
                        : `${startIndex + 1}–${endIndex} de ${totalFilteredCount}`}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={safeCurrentPage <= 1}
                      onClick={() =>
                        setCurrentPage((p) => Math.max(1, p - 1))
                      }
                      className="h-8 px-2.5 text-xs"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Anterior
                    </Button>
                    <span className="px-2 font-medium text-foreground">
                      Página {safeCurrentPage} de {totalPages}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={safeCurrentPage >= totalPages}
                      onClick={() =>
                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                      }
                      className="h-8 px-2.5 text-xs"
                    >
                      Próxima
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
