"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import JSZip from "jszip";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardPaste,
  History,
  Link2,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { consumeSharedPayload } from "@/lib/share-db";
import {
  ParsedReceipt,
  parseReceiptText,
} from "@/lib/receipt-parser";
import { cn } from "@/lib/utils";
import { clientesService, type ClienteRow } from "@/services/clientes.service";
import {
  buildComprovanteDefaults,
  comprovantesService,
  isSameReceiptComposite,
  suggestClientesForReceipt,
  type RelatorioMatchCandidate,
} from "@/services/comprovantes.service";

interface HistoryItem {
  id: string;
  createdAt: number;
  receipt: ParsedReceipt;
}

interface BulkReceiptItem {
  id: string;
  historyId?: string;
  fileName: string;
  status: "new" | "duplicate_db" | "duplicate_batch" | "error";
  errorMessage?: string;
  receipt?: ParsedReceipt;
  selected: boolean;
  selectedClienteId: string;
  reportDate?: string;
  matchedRelatorio?: RelatorioMatchCandidate;
  confirmRelatorioLink: boolean | null;
  nomeComprovante: string;
  valor: string;
  dataTransacao: string;
  horaTransacao: string;
  idTransacao: string;
  bancoPagador: string;
}

function isSameHistoryReceipt(a: ParsedReceipt, b: ParsedReceipt): boolean {
  const defA = buildComprovanteDefaults(a);
  const defB = buildComprovanteDefaults(b);
  return isSameReceiptComposite(
    {
      idTransacao: defA.id_transacao,
      dataTransacao: defA.data_transacao,
      horaTransacao: defA.hora_transacao,
      valor: defA.valor,
      nomeComprovante: defA.nome_comprovante,
    },
    {
      idTransacao: defB.id_transacao,
      dataTransacao: defB.data_transacao,
      horaTransacao: defB.hora_transacao,
      valor: defB.valor,
      nomeComprovante: defB.nome_comprovante,
    }
  );
}

function deduplicateHistoryList(items: HistoryItem[]): HistoryItem[] {
  const unique: HistoryItem[] = [];
  for (const item of items) {
    if (!item?.receipt) continue;
    const exists = unique.some((u) => isSameHistoryReceipt(u.receipt, item.receipt));
    if (!exists) {
      unique.push(item);
    }
  }
  return unique.slice(0, 10);
}

function isZipFile(file: File): boolean {
  return (
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed" ||
    file.name.toLowerCase().endsWith(".zip")
  );
}

function isPdfFile(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

function isImageFile(file: File): boolean {
  return (
    file.type.startsWith("image/") ||
    /\.(png|jpe?g|webp|bmp)$/i.test(file.name)
  );
}

function getMimeTypeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".bmp")) return "image/bmp";
  return "image/jpeg";
}

interface ClientPickerProps {
  id: string;
  clientes: ClienteRow[];
  clientesLoaded: boolean;
  value: string;
  onChange: (clienteId: string) => void;
  placeholder?: string;
}

function ClientPicker({
  id,
  clientes,
  clientesLoaded,
  value,
  onChange,
  placeholder = "Clique e digite para buscar um cliente...",
}: ClientPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selectedCliente = clientes.find((cliente) => cliente.id === value);

  const filteredClientes = clientes.filter((cliente) => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return true;
    return [
      cliente.nome_loja,
      ...(cliente.nomes_comprovante ?? []),
      ...(cliente.nomes_relatorio ?? []),
    ]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalizedQuery);
  });

  function chooseCliente(cliente: ClienteRow) {
    setQuery(cliente.nome_loja);
    setOpen(false);
    onChange(cliente.id);
  }

  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        aria-autocomplete="list"
        value={query || selectedCliente?.nome_loja || ""}
        onFocus={(event) => {
          setOpen(true);
          event.currentTarget.select();
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          onChange("");
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        placeholder={
          clientesLoaded ? placeholder : "Carregando clientes..."
        }
        disabled={!clientesLoaded}
        autoComplete="off"
      />
      {open && clientesLoaded && (
        <div
          id={`${id}-options`}
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg"
        >
          {filteredClientes.length > 0 ? (
            filteredClientes.map((cliente) => (
              <button
                key={cliente.id}
                type="button"
                role="option"
                aria-selected={value === cliente.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseCliente(cliente)}
                className={cn(
                  "w-full rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-accent",
                  value === cliente.id && "bg-primary/10 font-medium"
                )}
              >
                {cliente.nome_loja}
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              Nenhum cliente encontrado.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

interface BulkItemFieldsEditorProps {
  item: BulkReceiptItem;
  selectedCliente?: ClienteRow;
  onUpdate: (patch: Partial<BulkReceiptItem>) => void;
}

function BulkItemFieldsEditor({
  item,
  selectedCliente,
  onUpdate,
}: BulkItemFieldsEditorProps) {
  const [draftNome, setDraftNome] = useState(item.nomeComprovante);
  const [draftValor, setDraftValor] = useState(item.valor);

  const clientReceiptNames = selectedCliente?.nomes_comprovante ?? [];

  return (
    <>
      <div className="space-y-1.5 sm:col-span-2">
        <Label
          className={cn(
            "text-xs",
            !item.nomeComprovante.trim() && "text-amber-700"
          )}
        >
          Nome no comprovante *
        </Label>
        <div className="flex gap-2">
          <Input
            value={draftNome}
            onChange={(e) => setDraftNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (draftNome.trim()) {
                  onUpdate({ nomeComprovante: draftNome.trim() });
                }
              }
            }}
            placeholder="Informe o nome do pagador"
            className="h-9 text-xs"
          />
          <Button
            type="button"
            size="sm"
            variant={
              item.nomeComprovante.trim() &&
              item.nomeComprovante.trim() === draftNome.trim()
                ? "outline"
                : "default"
            }
            disabled={!draftNome.trim()}
            onClick={() => onUpdate({ nomeComprovante: draftNome.trim() })}
            className="h-9 shrink-0 px-3 text-xs"
          >
            <Check className="h-3.5 w-3.5" />
            OK
          </Button>
        </div>

        {clientReceiptNames.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="text-[11px] font-medium text-muted-foreground">
              Sugestões do cliente:
            </span>
            {clientReceiptNames.map((nome, idx) => {
              const isCurrent =
                draftNome.trim().toLowerCase() === nome.trim().toLowerCase() &&
                item.nomeComprovante.trim().toLowerCase() ===
                  nome.trim().toLowerCase();
              return (
                <button
                  key={`${nome}-${idx}`}
                  type="button"
                  onClick={() => {
                    setDraftNome(nome);
                    onUpdate({ nomeComprovante: nome });
                  }}
                  className={cn(
                    "cursor-pointer rounded-lg border px-2 py-0.5 text-left text-[11px] font-medium transition-colors",
                    isCurrent
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-secondary/70 text-foreground hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
                  )}
                  title="Clique para usar este nome no comprovante"
                >
                  {nome}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-1 sm:col-span-2">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className={cn("text-xs", !item.valor && "text-amber-700")}>
              Valor (R$) *
            </Label>
            <div className="flex gap-1.5">
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={draftValor}
                onChange={(e) => setDraftValor(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (draftValor) {
                      onUpdate({ valor: draftValor });
                    }
                  }
                }}
                placeholder="0.00"
                className="h-9 text-xs"
              />
              <Button
                type="button"
                size="sm"
                variant={
                  item.valor && item.valor === draftValor ? "outline" : "default"
                }
                disabled={!draftValor}
                onClick={() => onUpdate({ valor: draftValor })}
                className="h-9 shrink-0 px-2.5 text-xs"
              >
                <Check className="h-3.5 w-3.5" />
                OK
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <Label
              className={cn("text-xs", !item.dataTransacao && "text-amber-700")}
            >
              Data do pagamento *
            </Label>
            <Input
              type="date"
              value={item.dataTransacao}
              onChange={(e) => onUpdate({ dataTransacao: e.target.value })}
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Hora do pagamento</Label>
            <Input
              type="time"
              value={item.horaTransacao}
              onChange={(e) => onUpdate({ horaTransacao: e.target.value })}
              className="h-9 text-xs"
            />
          </div>
        </div>
      </div>
    </>
  );
}

function formatReportDate(dateIso: string): string {
  const [year, month, day] = dateIso.split("-");
  return year && month && day ? `${day}/${month}/${year}` : dateIso;
}

const HISTORY_KEY = "pix-paes-history-v1";

function extractFirstUrl(input: string): string | null {
  const match = input.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : null;
}

function isPassakyReceiver(parsed: ParsedReceipt): boolean {
  const name = (parsed.receiverName || "").toLowerCase();
  const doc = (parsed.receiverDocument || "").replace(/\D/g, "");
  const key = (parsed.pixKey || "").toLowerCase();
  return (
    name.includes("passaky") ||
    doc === "40929283000175" ||
    key.includes("passaky")
  );
}

export function ReceiptReader() {
  const router = useRouter();
  const [linkInput, setLinkInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warningToast, setWarningToast] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Supabase clients & receipt persistence state
  const [clientes, setClientes] = useState<ClienteRow[]>([]);
  const [clientesLoaded, setClientesLoaded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [bulkItems, setBulkItems] = useState<BulkReceiptItem[]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [saveModalResult, setSaveModalResult] = useState<{
    open: boolean;
    title: string;
    description: string;
    reconciledCount: number;
    reconciledItems: Array<{
      id: string;
      nomeComprovante: string;
      nomeCliente: string;
      valor: string;
      reportDate: string;
      nomeRelatorio: string;
    }>;
    skippedCount: number;
    isBatch: boolean;
  }>({
    open: false,
    title: "",
    description: "",
    reconciledCount: 0,
    reconciledItems: [],
    skippedCount: 0,
    isBatch: false,
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load active clients from Supabase for matching
  useEffect(() => {
    let mounted = true;
    clientesService.list().then(({ data }) => {
      if (!mounted) return;
      setClientes(data.filter((c) => c.ativo));
      setClientesLoaded(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Re-run client suggestion if clients finish loading after bulkItems are already set
  useEffect(() => {
    if (clientes.length === 0) return;
    setBulkItems((prev) => {
      if (prev.length === 0) return prev;
      let changed = false;
      const next = prev.map((item) => {
        if (item.selectedClienteId || !item.receipt) return item;
        const matched = suggestClientesForReceipt(
          item.receipt.payerName,
          clientes
        );
        const suggestedId = matched[0]?.cliente.id ?? "";
        if (!suggestedId) return item;
        changed = true;
        return { ...item, selectedClienteId: suggestedId };
      });
      return changed ? next : prev;
    });
  }, [clientes]);

  // Load history (and deduplicate any existing repeated items)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) {
        const parsedList = JSON.parse(saved) as HistoryItem[];
        const cleanList = deduplicateHistoryList(parsedList);
        setHistory(cleanList);
        if (cleanList.length !== parsedList.length) {
          localStorage.setItem(HISTORY_KEY, JSON.stringify(cleanList));
        }
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const saveToHistory = useCallback((parsed: ParsedReceipt): string => {
    if (!isPassakyReceiver(parsed)) {
      const detected = parsed.receiverName
        ? ` (${parsed.receiverName})`
        : "";
      setWarningToast(
        `O recebedor deste comprovante não é a Passaky Burg${detected}.`
      );
    } else {
      setWarningToast(null);
    }

    const historyId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    setHistory((prev) => {
      const filteredPrev = prev.filter(
        (existing) => !isSameHistoryReceipt(existing.receipt, parsed)
      );
      const next: HistoryItem[] = [
        {
          id: historyId,
          createdAt: Date.now(),
          receipt: parsed,
        },
        ...filteredPrev,
      ].slice(0, 10);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });

    return historyId;
  }, []);

  const updateHistoryEntry = useCallback(
    (
      target: { historyId?: string; idTransacao?: string },
      patch: Partial<ParsedReceipt>
    ) => {
      setHistory((prev) => {
        let updated = false;
        const next = prev.map((entry) => {
          const matchById =
            Boolean(target.historyId) && entry.id === target.historyId;
          const matchByTx =
            !matchById &&
            Boolean(target.idTransacao) &&
            entry.receipt.transactionId === target.idTransacao;

          if (!matchById && !matchByTx) return entry;
          updated = true;
          return {
            ...entry,
            receipt: {
              ...entry.receipt,
              ...patch,
            },
          };
        });

        if (!updated) return prev;
        try {
          localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
        } catch {
          // ignore storage errors
        }
        return next;
      });
    },
    []
  );

  const getCandidateNamesForClienteId = useCallback(
    (clienteId: string): string[] => {
      const found = clientes.find((c) => c.id === clienteId);
      if (!found) return [];
      return [
        found.nome_loja,
        ...(found.nomes_comprovante ?? []),
        ...(found.nomes_relatorio ?? []),
      ].filter(Boolean);
    },
    [clientes]
  );

  const recheckItemAgainstReportAndDb = useCallback(
    async (updatedItem: BulkReceiptItem) => {
      const candidateNames = getCandidateNamesForClienteId(
        updatedItem.selectedClienteId
      );
      const { duplicateDbKeys, matchedRelatorios } =
        await comprovantesService.inspectReceiptCandidates([
          {
            key: updatedItem.id,
            idTransacao: updatedItem.idTransacao,
            dataTransacao: updatedItem.dataTransacao,
            horaTransacao: updatedItem.horaTransacao,
            valor: updatedItem.valor,
            nomeComprovante: updatedItem.nomeComprovante,
            candidateNames,
          },
        ]);

      const isDupDb = duplicateDbKeys.has(updatedItem.id);
      const matchedRel = matchedRelatorios.get(updatedItem.id);

      setBulkItems((prev) =>
        prev.map((row) => {
          if (row.id !== updatedItem.id) return row;
          const sameMatchedRelId =
            row.matchedRelatorio?.relatorioId &&
            row.matchedRelatorio.relatorioId === matchedRel?.relatorioId;

          return {
            ...row,
            status: isDupDb ? "duplicate_db" : row.status,
            selected: isDupDb ? false : row.selected,
            reportDate: matchedRel?.dataTransacao,
            matchedRelatorio: matchedRel,
            confirmRelatorioLink: matchedRel
              ? sameMatchedRelId
                ? row.confirmRelatorioLink
                : null
              : null,
          };
        })
      );
    },
    [getCandidateNamesForClienteId]
  );

  const finalizeParsedResults = useCallback(
    async (
      rawResults: Array<{
        fileName: string;
        receipt?: ParsedReceipt;
        errorMessage?: string;
        existingHistoryId?: string;
      }>
    ) => {
      const baseTimestamp = Date.now();
      const draftItems = rawResults.map((res, idx) => {
        const itemId = `${baseTimestamp}-${idx}`;
        if (!res.receipt) {
          return {
            itemId,
            res,
            defaults: null,
            suggestedClienteId: "",
            candidateNames: [] as string[],
          };
        }
        const defaults = buildComprovanteDefaults(res.receipt);
        const matched = suggestClientesForReceipt(
          res.receipt.payerName,
          clientes
        );
        const suggestedCliente = matched[0]?.cliente;
        const candidateNames = suggestedCliente
          ? [
              suggestedCliente.nome_loja,
              ...(suggestedCliente.nomes_comprovante ?? []),
              ...(suggestedCliente.nomes_relatorio ?? []),
            ].filter(Boolean)
          : [];
        return {
          itemId,
          res,
          defaults,
          suggestedClienteId: suggestedCliente?.id ?? "",
          candidateNames,
        };
      });

      const lookupCandidates = draftItems
        .filter((d) => d.defaults !== null)
        .map((d) => ({
          key: d.itemId,
          idTransacao: d.defaults!.id_transacao.trim(),
          dataTransacao: d.defaults!.data_transacao,
          horaTransacao: d.defaults!.hora_transacao,
          valor: d.defaults!.valor,
          nomeComprovante: d.defaults!.nome_comprovante,
          candidateNames: d.candidateNames,
        }));

      const { duplicateDbKeys, matchedRelatorios, error: inspectError } =
        await comprovantesService.inspectReceiptCandidates(lookupCandidates);

      if (inspectError) {
        setBulkError(inspectError);
      }

      const acceptedInBatch: Array<{
        idTransacao: string;
        dataTransacao: string;
        horaTransacao: string;
        valor: string;
        nomeComprovante: string;
      }> = [];

      const builtItems: BulkReceiptItem[] = draftItems.map((draft) => {
        const { itemId, res, defaults, suggestedClienteId } = draft;
        if (!res.receipt || !defaults) {
          return {
            id: itemId,
            historyId: res.existingHistoryId,
            fileName: res.fileName,
            status: "error",
            errorMessage: res.errorMessage || "Falha na leitura.",
            selected: false,
            selectedClienteId: "",
            reportDate: undefined,
            matchedRelatorio: undefined,
            confirmRelatorioLink: null,
            nomeComprovante: "",
            valor: "",
            dataTransacao: "",
            horaTransacao: "",
            idTransacao: "",
            bancoPagador: "",
          };
        }

        const txId = defaults.id_transacao.trim();
        let status: BulkReceiptItem["status"] = "new";

        const isDupInBatch = acceptedInBatch.some((prev) =>
          isSameReceiptComposite(prev, {
            idTransacao: txId,
            dataTransacao: defaults.data_transacao,
            horaTransacao: defaults.hora_transacao,
            valor: defaults.valor,
            nomeComprovante: defaults.nome_comprovante,
          })
        );

        if (duplicateDbKeys.has(itemId)) {
          status = "duplicate_db";
        } else if (isDupInBatch) {
          status = "duplicate_batch";
        } else {
          acceptedInBatch.push({
            idTransacao: txId,
            dataTransacao: defaults.data_transacao,
            horaTransacao: defaults.hora_transacao,
            valor: defaults.valor,
            nomeComprovante: defaults.nome_comprovante,
          });
        }

        // Only save to "Últimos comprovantes lidos" if not a duplicate (and deduplicate inside saveToHistory)
        const historyId =
          res.existingHistoryId ||
          (status === "new" ? saveToHistory(res.receipt) : undefined);

        const matchedRel = matchedRelatorios.get(itemId);

        return {
          id: itemId,
          historyId,
          fileName: res.fileName,
          status,
          receipt: res.receipt,
          selected: status === "new",
          selectedClienteId: suggestedClienteId,
          reportDate: matchedRel?.dataTransacao,
          matchedRelatorio: matchedRel,
          confirmRelatorioLink: matchedRel ? null : null,
          nomeComprovante: defaults.nome_comprovante,
          valor: defaults.valor,
          dataTransacao: defaults.data_transacao,
          horaTransacao: defaults.hora_transacao,
          idTransacao: txId,
          bancoPagador: defaults.banco_pagador,
        };
      });

      setBulkItems(builtItems);
    },
    [clientes, saveToHistory]
  );

  const processSingleParsedReceipt = useCallback(
    async (
      parsed: ParsedReceipt,
      fileName: string,
      existingHistoryId?: string
    ) => {
      setBulkError(null);
      await finalizeParsedResults([
        { fileName, receipt: parsed, existingHistoryId },
      ]);
    },
    [finalizeParsedResults]
  );

  const processUrl = useCallback(
    async (url: string) => {
      setError(null);
      setBulkError(null);
      setBulkItems([]);
      setLoading(true);
      setProgress(null);
      setStatusMessage("Buscando comprovante pelo link...");

      try {
        const res = await fetch("/api/parse-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const data = (await res.json()) as {
          receipt?: ParsedReceipt;
          error?: string;
        };

        if (!res.ok || !data.receipt) {
          throw new Error(data.error || "Erro ao ler o link.");
        }

        await processSingleParsedReceipt(data.receipt, "Comprovante via link");
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar o link do comprovante."
        );
      } finally {
        setLoading(false);
        setStatusMessage("");
      }
    },
    [processSingleParsedReceipt]
  );

  const processBulkFiles = useCallback(
    async (inputFiles: File[]) => {
      setError(null);
      setBulkError(null);
      setBulkItems([]);
      setLoading(true);
      setProgress(0);
      setStatusMessage("Preparando arquivos...");

      const extractedFiles: File[] = [];

      try {
        for (const file of inputFiles) {
          if (isZipFile(file)) {
            setStatusMessage(`Extraindo ${file.name}...`);
            const zip = await JSZip.loadAsync(await file.arrayBuffer());
            const entries = Object.values(zip.files).filter((entry) => {
              if (entry.dir) return false;
              const base = entry.name.split("/").pop() || entry.name;
              if (base.startsWith(".") || entry.name.includes("__MACOSX")) {
                return false;
              }
              return /\.(pdf|png|jpe?g|webp|bmp)$/i.test(base);
            });

            for (const entry of entries) {
              const blob = await entry.async("blob");
              const baseName = entry.name.split("/").pop() || entry.name;
              extractedFiles.push(
                new File([blob], baseName, {
                  type: getMimeTypeFromName(baseName),
                })
              );
            }
          } else if (isPdfFile(file) || isImageFile(file)) {
            extractedFiles.push(file);
          }
        }

        if (extractedFiles.length === 0) {
          setError(
            "Nenhum arquivo de imagem (PNG/JPG/WEBP) ou PDF válido foi encontrado."
          );
          return;
        }

        let ocrWorker: Awaited<
          ReturnType<typeof import("tesseract.js")["createWorker"]>
        > | null = null;

        const getOcrWorker = async () => {
          if (ocrWorker) return ocrWorker;
          setStatusMessage("Carregando motor OCR em português...");
          const { createWorker, PSM } = await import("tesseract.js");
          ocrWorker = await createWorker("por", 1, {
            langPath: window.location.origin,
          });
          await ocrWorker.setParameters({
            tessedit_pageseg_mode: PSM.SINGLE_COLUMN,
          });
          return ocrWorker;
        };

        if (extractedFiles.some((f) => isImageFile(f))) {
          await getOcrWorker();
        }

        const rawResults: Array<{
          fileName: string;
          receipt?: ParsedReceipt;
          errorMessage?: string;
        }> = [];

        try {
          for (let i = 0; i < extractedFiles.length; i++) {
            const current = extractedFiles[i];
            setProgress(Math.round(((i + 1) / extractedFiles.length) * 100));
            setStatusMessage(
              `Analisando (${i + 1}/${extractedFiles.length}): ${current.name}`
            );

            try {
              if (isPdfFile(current)) {
                const formData = new FormData();
                formData.append("file", current);
                const res = await fetch("/api/parse-pdf", {
                  method: "POST",
                  body: formData,
                });
                const data = (await res.json()) as {
                  receipt?: ParsedReceipt;
                  needsOcr?: boolean;
                  images?: string[];
                  error?: string;
                };
                if (!res.ok) {
                  rawResults.push({
                    fileName: current.name,
                    errorMessage: data.error || "Erro ao ler PDF.",
                  });
                } else if (data.needsOcr && data.images && data.images.length > 0) {
                  const worker = await getOcrWorker();
                  const pageTexts: string[] = [];
                  for (const imgUrl of data.images) {
                    const {
                      data: { text },
                    } = await worker.recognize(imgUrl);
                    if (text) pageTexts.push(text);
                  }
                  const parsed = parseReceiptText(pageTexts.join("\n"), "pdf");
                  rawResults.push({
                    fileName: current.name,
                    receipt: parsed,
                  });
                } else if (!data.receipt) {
                  rawResults.push({
                    fileName: current.name,
                    errorMessage: data.error || "Erro ao ler PDF.",
                  });
                } else {
                  rawResults.push({
                    fileName: current.name,
                    receipt: data.receipt,
                  });
                }
              } else {
                const worker = await getOcrWorker();
                const {
                  data: { text },
                } = await worker.recognize(current);
                const parsed = parseReceiptText(text, "image");
                rawResults.push({
                  fileName: current.name,
                  receipt: parsed,
                });
              }
            } catch (err) {
              rawResults.push({
                fileName: current.name,
                errorMessage:
                  err instanceof Error
                    ? err.message
                    : "Falha ao processar arquivo.",
              });
            }
          }
        } finally {
          if (ocrWorker) {
            await ocrWorker.terminate();
          }
        }

        await finalizeParsedResults(rawResults);
      } catch (err) {
        console.error("[Bulk] Error:", err);
        setError("Não foi possível processar os arquivos enviados.");
      } finally {
        setLoading(false);
        setProgress(null);
        setStatusMessage("");
      }
    },
    [finalizeParsedResults]
  );

  const handleFilesInput = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;
      await processBulkFiles(files);
    },
    [processBulkFiles]
  );

  // Check if opened via Web Share Target
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isShared = params.get("shared") === "1";
    const hasSharedError = params.get("shared_error") === "1";
    const queryUrl = params.get("url");
    const queryText = params.get("text");

    if (hasSharedError) {
      setError("Ocorreu um erro ao receber o arquivo compartilhado.");
      window.history.replaceState({}, "", "/");
      return;
    }

    if (isShared) {
      window.history.replaceState({}, "", "/");
      (async () => {
        const payload = await consumeSharedPayload();
        if (!payload) return;

        if (payload.file) {
          const file = new File([payload.file.buffer], payload.file.name, {
            type: payload.file.type,
          });
          await processBulkFiles([file]);
          return;
        }

        const possibleUrl =
          extractFirstUrl(payload.url) ||
          extractFirstUrl(payload.text) ||
          extractFirstUrl(payload.title);

        if (possibleUrl) {
          setLinkInput(possibleUrl);
          await processUrl(possibleUrl);
          return;
        }

        if (payload.text) {
          const parsed = parseReceiptText(payload.text, "text");
          await processSingleParsedReceipt(parsed, "Texto compartilhado");
        }
      })();
      return;
    }

    if (queryUrl || queryText) {
      window.history.replaceState({}, "", "/");
      const possibleUrl =
        (queryUrl && extractFirstUrl(queryUrl)) ||
        (queryText && extractFirstUrl(queryText));
      if (possibleUrl) {
        setLinkInput(possibleUrl);
        void processUrl(possibleUrl);
      } else if (queryText) {
        const parsed = parseReceiptText(queryText, "text");
        void processSingleParsedReceipt(parsed, "Texto compartilhado");
      }
    }
  }, [processBulkFiles, processSingleParsedReceipt, processUrl]);

  const handleLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = linkInput.trim();
    if (!trimmed) return;

    const url = extractFirstUrl(trimmed);
    if (url) {
      await processUrl(url);
    } else {
      // Treat as pasted receipt text
      const parsed = parseReceiptText(trimmed, "text");
      await processSingleParsedReceipt(parsed, "Texto colado");
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setLinkInput(text.trim());
      }
    } catch {
      setError(
        "Não foi possível acessar a área de transferência. Cole manualmente no campo."
      );
    }
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
  };

  const newItemsCount = bulkItems.filter((item) => item.status === "new").length;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6 pb-16">
      {/* Yellow Warning Toast */}
      {warningToast && (
        <div
          role="alert"
          className="fixed top-4 left-4 right-4 z-50 mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-amber-400 bg-amber-50 p-4 text-amber-950 shadow-lg sm:left-auto sm:right-4"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-amber-900">Atenção</p>
            <p className="mt-0.5 text-xs text-amber-900/90">{warningToast}</p>
          </div>
          <button
            type="button"
            onClick={() => setWarningToast(null)}
            className="shrink-0 rounded-lg p-1 text-amber-700 transition hover:bg-amber-200/60"
            aria-label="Fechar aviso"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header and upload */}
      <Card className="overflow-hidden">
        <CardHeader className="p-5">
          <CardTitle className="text-base font-bold uppercase tracking-wide text-primary">
            Leitor de Comprovantes PIX
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 border-t border-border p-5">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,application/pdf,.pdf,.zip,application/zip,application/x-zip-compressed"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                void handleFilesInput(e.target.files);
              }
              e.target.value = "";
            }}
          />

          <div className="flex flex-col gap-3">
            <button
              type="button"
              disabled={loading}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!loading) setIsDragging(true);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!loading) setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(false);
                if (loading) return;
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  void handleFilesInput(e.dataTransfer.files);
                }
              }}
              className={`flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-4 py-5 text-sm font-semibold transition disabled:opacity-50 ${
                isDragging
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-blue-300 bg-blue-50/50 text-blue-900 hover:border-blue-500 hover:bg-blue-50"
              }`}
            >
              <div className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-blue-800" />
                <span>
                  {isDragging
                    ? "Solte os arquivos aqui..."
                    : "Envie os comprovantes"}
                </span>
              </div>
              <span className="text-xs font-normal text-muted-foreground">
                Você pode enviar várias imagens e PDFs de uma só vez, ou até
                mesmo uma pasta zipada de comprovantes
              </span>
            </button>

            <form onSubmit={handleLinkSubmit} className="flex flex-col gap-2.5">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={linkInput}
                    onChange={(e) => setLinkInput(e.target.value)}
                    placeholder="Cole o link ou texto do recibo..."
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:bg-white focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={handlePaste}
                  disabled={loading}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl border border-blue-200 bg-blue-50 px-3.5 py-3 text-sm font-semibold text-blue-900 transition hover:bg-blue-100 active:scale-95 disabled:opacity-40"
                  title="Colar da área de transferência"
                >
                  <ClipboardPaste className="h-4 w-4" />
                  <span>Colar</span>
                </button>
              </div>

              <button
                type="submit"
                disabled={loading || !linkInput.trim()}
                className="w-full rounded-2xl bg-blue-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-950 active:scale-[0.99] disabled:opacity-40"
              >
                Ler comprovante
              </button>
            </form>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="mt-4 flex flex-col gap-2 rounded-2xl bg-slate-50 p-3.5">
              <div className="flex items-center gap-2.5 text-sm font-medium text-slate-700">
                <Loader2 className="h-4 w-4 animate-spin text-blue-800" />
                <span>{statusMessage || "Processando comprovante..."}</span>
                {progress !== null && (
                  <span className="ml-auto font-mono text-xs font-bold text-blue-900">
                    {progress}%
                  </span>
                )}
              </div>
              {progress !== null && (
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-blue-800 transition-all duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Unified Upload Review (Single & Batch) */}
      {bulkItems.length > 0 && (
        <Card className="border-primary/20">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base font-bold uppercase tracking-wide text-primary">
                {newItemsCount === 1
                  ? "1 novo comprovante"
                  : `${newItemsCount} novos comprovantes`}
              </CardTitle>
              <div className="flex flex-wrap gap-1.5">
                {bulkItems.some((i) => i.status === "error") && (
                  <Badge variant="warning">
                    {bulkItems.filter((i) => i.status === "error").length} com
                    erro
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {bulkItems.some(
              (item) =>
                item.status === "duplicate_db" ||
                item.status === "duplicate_batch"
            ) && (
              <div
                role="alert"
                className="rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
              >
                <p className="font-semibold">
                  Foram encontrados comprovantes duplicados. Eles não serão
                  salvos novamente.
                </p>
              </div>
            )}

            {newItemsCount === 0 ? (
              <div className="rounded-xl border border-border bg-secondary/40 p-4 text-center text-sm text-muted-foreground">
                Nenhum comprovante novo para adicionar (todos já estavam
                cadastrados ou falharam na leitura).
              </div>
            ) : (
              <div className="space-y-3">
                {bulkItems
                  .filter((i) => i.status === "new")
                  .map((item) => {
                    const hasUnidentifiedData =
                      !item.selectedClienteId ||
                      !item.nomeComprovante.trim() ||
                      !item.valor ||
                      !item.dataTransacao;

                    return (
                    <div
                      key={item.id}
                      className={cn(
                        "space-y-2.5 rounded-xl border p-3.5 transition-colors",
                        hasUnidentifiedData
                          ? "border-destructive bg-destructive/10"
                          : "border-border bg-card"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <label className="flex cursor-pointer items-start gap-2.5">
                          <input
                            type="checkbox"
                            checked={item.selected}
                            onChange={(e) =>
                              setBulkItems((prev) =>
                                prev.map((row) =>
                                  row.id === item.id
                                    ? { ...row, selected: e.target.checked }
                                    : row
                                )
                              )
                            }
                            className="mt-1 h-4 w-4 rounded border-input accent-primary"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">
                              {item.nomeComprovante ||
                                "Pagador não identificado"}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {item.fileName}
                              {item.dataTransacao
                                ? ` • ${item.dataTransacao}`
                                : ""}
                              {item.horaTransacao
                                ? ` ${item.horaTransacao}`
                                : ""}
                            </p>
                            {item.reportDate && (
                              <p className="text-xs font-medium text-primary">
                                Será vinculado ao relatório de{" "}
                                {formatReportDate(item.reportDate)}
                              </p>
                            )}
                            {item.idTransacao && (
                              <p className="truncate font-mono text-[11px] text-muted-foreground">
                                {item.idTransacao}
                              </p>
                            )}
                          </div>
                        </label>

                        <span className="shrink-0 text-sm font-bold text-primary">
                          {item.valor ? `R$ ${item.valor}` : "Sem valor"}
                        </span>
                      </div>

                      {item.selected && (
                        <div className="grid gap-3 pt-1 sm:grid-cols-2">
                          <div className="space-y-1.5 sm:col-span-2">
                            <div className="flex flex-wrap items-center justify-between gap-1">
                              <Label
                                htmlFor={`bulk-client-${item.id}`}
                                className="text-xs"
                              >
                                Cliente *
                              </Label>
                              {!item.selectedClienteId && (
                                <Badge variant="warning" className="text-[10px]">
                                  Selecione o cliente
                                </Badge>
                              )}
                            </div>
                            <ClientPicker
                              key={item.id}
                              id={`bulk-client-${item.id}`}
                              clientes={clientes}
                              clientesLoaded={clientesLoaded}
                              value={item.selectedClienteId}
                              onChange={(clienteId) => {
                                const nextItem: BulkReceiptItem = {
                                  ...item,
                                  selectedClienteId: clienteId,
                                };
                                setBulkItems((prev) =>
                                  prev.map((row) =>
                                    row.id === item.id ? nextItem : row
                                  )
                                );
                                if (clienteId) {
                                  void recheckItemAgainstReportAndDb(nextItem);
                                }
                              }}
                              placeholder="Selecione e digite o nome do cliente..."
                            />
                          </div>

                          <BulkItemFieldsEditor
                            item={item}
                            selectedCliente={clientes.find(
                              (c) => c.id === item.selectedClienteId
                            )}
                            onUpdate={(patch) => {
                              const nextItem: BulkReceiptItem = {
                                ...item,
                                ...patch,
                                receipt: item.receipt
                                  ? {
                                      ...item.receipt,
                                      ...(patch.nomeComprovante !== undefined
                                        ? {
                                            payerName: patch.nomeComprovante,
                                          }
                                        : {}),
                                    }
                                  : item.receipt,
                              };

                              setBulkItems((prev) =>
                                prev.map((row) =>
                                  row.id === item.id ? nextItem : row
                                )
                              );

                              if (patch.nomeComprovante !== undefined) {
                                updateHistoryEntry(
                                  {
                                    historyId: item.historyId,
                                    idTransacao: item.idTransacao,
                                  },
                                  { payerName: patch.nomeComprovante }
                                );
                              }

                              void recheckItemAgainstReportAndDb(nextItem);
                            }}
                          />

                          {item.matchedRelatorio && (
                            <div
                              className={cn(
                                "space-y-2.5 rounded-xl border p-3 sm:col-span-2",
                                item.confirmRelatorioLink === true
                                  ? "border-emerald-300 bg-emerald-50/70"
                                  : item.confirmRelatorioLink === false
                                    ? "border-border bg-secondary/40"
                                    : "border-primary/40 bg-primary/5"
                              )}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="space-y-0.5">
                                  <p className="text-xs font-bold text-foreground">
                                    Este comprovante bate com o relatório de{" "}
                                    {formatReportDate(
                                      item.matchedRelatorio.dataTransacao
                                    )}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    <span className="font-semibold text-foreground">
                                      {item.matchedRelatorio.nomeRelatorio}
                                    </span>{" "}
                                    • R${" "}
                                    {item.matchedRelatorio.valor
                                      .toFixed(2)
                                      .replace(".", ",")}{" "}
                                    às {item.matchedRelatorio.horaTransacao}
                                  </p>
                                </div>
                                <Badge
                                  variant={
                                    item.confirmRelatorioLink === true
                                      ? "success"
                                      : item.confirmRelatorioLink === false
                                        ? "secondary"
                                        : "warning"
                                  }
                                  className="text-[10px]"
                                >
                                  {item.confirmRelatorioLink === true
                                    ? "Vínculo confirmado"
                                    : item.confirmRelatorioLink === false
                                      ? "Não vincular"
                                      : "Confirmação pendente"}
                                </Badge>
                              </div>

                              <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                                <span className="text-xs font-medium text-foreground">
                                  Deseja vincular este comprovante ao relatório e
                                  marcar como conferido?
                                </span>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={
                                      item.confirmRelatorioLink === true
                                        ? "default"
                                        : "outline"
                                    }
                                    onClick={() =>
                                      setBulkItems((prev) =>
                                        prev.map((row) =>
                                          row.id === item.id
                                            ? {
                                                ...row,
                                                confirmRelatorioLink: true,
                                              }
                                            : row
                                        )
                                      )
                                    }
                                    className="h-8 px-3 text-xs"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                    Confirmar vínculo
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={
                                      item.confirmRelatorioLink === false
                                        ? "secondary"
                                        : "outline"
                                    }
                                    onClick={() =>
                                      setBulkItems((prev) =>
                                        prev.map((row) =>
                                          row.id === item.id
                                            ? {
                                                ...row,
                                                confirmRelatorioLink: false,
                                              }
                                            : row
                                        )
                                      )
                                    }
                                    className="h-8 px-3 text-xs"
                                  >
                                    Salvar sem vincular
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    );
                  })}
              </div>
            )}

            {bulkItems.some((i) => i.status !== "new") && (
              <div className="space-y-1.5 rounded-xl border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">
                  Ignorados automaticamente:
                </p>
                {bulkItems
                  .filter((i) => i.status !== "new")
                  .map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="truncate">{item.fileName}</span>
                      <span className="shrink-0">
                        {item.status === "duplicate_db"
                          ? "Já cadastrado no banco"
                          : item.status === "duplicate_batch"
                            ? "Duplicado no lote"
                            : item.errorMessage || "Erro na leitura"}
                      </span>
                    </div>
                  ))}
              </div>
            )}

            {bulkError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                {bulkError}
              </div>
            )}

            {newItemsCount > 0 && (
              <Button
                type="button"
                disabled={
                  bulkSaving ||
                  bulkItems.filter((i) => i.status === "new" && i.selected)
                    .length === 0 ||
                  bulkItems.some(
                    (i) =>
                      i.status === "new" &&
                      i.selected &&
                      (!i.selectedClienteId ||
                        !i.nomeComprovante.trim() ||
                        !i.valor ||
                        !i.dataTransacao ||
                        (Boolean(i.matchedRelatorio) &&
                          i.confirmRelatorioLink === null))
                  )
                }
                className="w-full"
                onClick={async () => {
                  setBulkError(null);
                  const selectedNew = bulkItems.filter(
                    (i) => i.status === "new" && i.selected
                  );
                  if (selectedNew.length === 0) return;

                  const payload = selectedNew.map((item) => ({
                    id_cliente: item.selectedClienteId,
                    nome_comprovante: item.nomeComprovante.trim(),
                    valor: Number(Number(item.valor).toFixed(2)),
                    data_transacao: item.dataTransacao,
                    hora_transacao: item.horaTransacao || null,
                    id_transacao: item.idTransacao.trim() || null,
                    banco_pagador: item.bancoPagador.trim() || null,
                    nome_recebedor: item.receipt?.receiverName || null,
                    cpf_cnpj_pagador: item.receipt?.payerDocument || null,
                    status:
                      item.matchedRelatorio && item.confirmRelatorioLink
                        ? ("conferido" as const)
                        : ("aguardando_relatorio" as const),
                    confianca_ocr: item.receipt?.confidence || null,
                    matched_relatorio_id:
                      item.matchedRelatorio && item.confirmRelatorioLink
                        ? item.matchedRelatorio.relatorioId
                        : null,
                  }));

                  setBulkSaving(true);
                  const result = await comprovantesService.saveBatch(payload);
                  setBulkSaving(false);

                  if (result.error) {
                    setBulkError(result.error);
                    return;
                  }

                  const ignoredBefore = bulkItems.filter(
                    (i) =>
                      i.status === "duplicate_db" ||
                      i.status === "duplicate_batch"
                  ).length;

                  const reconciledItems = selectedNew
                    .filter((i) => Boolean(i.matchedRelatorio && i.confirmRelatorioLink))
                    .map((i) => {
                      const clienteNome =
                        clientes.find((c) => c.id === i.selectedClienteId)
                          ?.nome_loja || "";
                      return {
                        id: i.id,
                        nomeComprovante: i.nomeComprovante.trim(),
                        nomeCliente: clienteNome,
                        valor: i.valor,
                        reportDate: i.matchedRelatorio!.dataTransacao,
                        nomeRelatorio: i.matchedRelatorio!.nomeRelatorio,
                      };
                    });

                  setSaveModalResult({
                    open: true,
                    title: `${result.insertedCount} comprovante(s) salvo(s) com sucesso!`,
                    description: "Comprovante(s) processado(s) e vinculado(s) aos clientes.",
                    reconciledCount: result.reconciledCount,
                    reconciledItems,
                    skippedCount: ignoredBefore + result.skippedCount,
                    isBatch: true,
                  });
                }}
              >
                {bulkSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Confirmar e salvar{" "}
                    {
                      bulkItems.filter((i) => i.status === "new" && i.selected)
                        .length
                    }{" "}
                    novo(s)
                  </>
                )}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {bulkItems.length === 0 && !loading && (
        <section className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <Sparkles className="mx-auto h-9 w-9 text-blue-800" />
          <h2 className="mt-3 text-base font-semibold text-slate-800">
            Pronto para ler comprovantes
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Envie uma foto (print do WhatsApp), um PDF de banco (PicPay, Stone,
            Nubank, Inter, PagBank, Mercado Pago) ou cole um link de recibo
            (como InfinitePay).
          </p>
        </section>
      )}

      {/* Recent History */}
      {history.length > 0 && (
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <History className="h-4 w-4 text-blue-800" />
              <span>Últimos comprovantes lidos</span>
            </div>
            <button
              type="button"
              onClick={clearHistory}
              className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Limpar
            </button>
          </div>
          <div className="flex flex-col divide-y divide-slate-100">
            {history.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 px-2 py-2.5 text-left"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {item.receipt.payerName || "Pagador não identificado"}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {item.receipt.bankDetected}
                    {item.receipt.dateTime ? ` • ${item.receipt.dateTime}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold text-blue-900">
                  {item.receipt.amount || "—"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <ConfirmModal
        open={saveModalResult.open}
        title={saveModalResult.title}
        description={saveModalResult.description}
        icon={
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700">
            <CheckCircle2 className="h-6 w-6" />
          </div>
        }
        confirmLabel="Adicionar outro comprovante"
        onConfirm={() => {
          setSaveModalResult({
            open: false,
            title: "",
            description: "",
            reconciledCount: 0,
            reconciledItems: [],
            skippedCount: 0,
            isBatch: false,
          });
          setBulkItems([]);
          setBulkError(null);
          setLinkInput("");
          setError(null);
          setWarningToast(null);
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        }}
        cancelLabel="Voltar para o início"
        onCancel={() => {
          setSaveModalResult({
            open: false,
            title: "",
            description: "",
            reconciledCount: 0,
            reconciledItems: [],
            skippedCount: 0,
            isBatch: false,
          });
          router.push("/");
        }}
      >
        {(saveModalResult.reconciledItems.length > 0 ||
          saveModalResult.skippedCount > 0) && (
          <div className="space-y-2.5 rounded-xl border border-border bg-secondary/40 p-3.5 text-sm">
            {saveModalResult.reconciledItems.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">
                    Vinculados ao relatório:
                  </span>
                  <Badge variant="success">
                    {`${saveModalResult.reconciledItems.length} conferido(s)`}
                  </Badge>
                </div>
                <div className="max-h-40 space-y-1.5 overflow-y-auto">
                  {saveModalResult.reconciledItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200/70 bg-emerald-50/70 px-2.5 py-1.5 text-xs text-emerald-950"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold">
                          {item.nomeCliente || item.nomeComprovante}
                        </p>
                        <p className="truncate text-[11px] text-emerald-800">
                          Relatório de {formatReportDate(item.reportDate)} •{" "}
                          {item.nomeRelatorio}
                        </p>
                      </div>
                      <span className="shrink-0 font-bold text-emerald-800">
                        R$ {Number(item.valor).toFixed(2).replace(".", ",")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {saveModalResult.skippedCount > 0 && (
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>Ignorados (já cadastrados):</span>
                <span className="font-semibold text-foreground">
                  {saveModalResult.skippedCount}
                </span>
              </div>
            )}
          </div>
        )}
      </ConfirmModal>
    </div>
  );
}
