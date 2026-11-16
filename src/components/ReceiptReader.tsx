"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Copy,
  Download,
  History,
  Link2,
  Loader2,
  Share2,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
  X,
} from "lucide-react";
import { consumeSharedPayload } from "@/lib/share-db";
import {
  ParsedReceipt,
  parseReceiptText,
} from "@/lib/receipt-parser";

interface HistoryItem {
  id: string;
  createdAt: number;
  receipt: ParsedReceipt;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
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
  const [receipt, setReceipt] = useState<ParsedReceipt | null>(null);
  const [linkInput, setLinkInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showReceiver, setShowReceiver] = useState(false);
  const [warningToast, setWarningToast] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load history & PWA install state
  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) {
        setHistory(JSON.parse(saved) as HistoryItem[]);
      }
    } catch {
      // ignore storage errors
    }

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone ===
        true;
    setIsStandalone(standalone);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () =>
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

  const saveToHistory = useCallback((parsed: ParsedReceipt) => {
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

    setHistory((prev) => {
      const next: HistoryItem[] = [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          createdAt: Date.now(),
          receipt: parsed,
        },
        ...prev,
      ].slice(0, 10);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const processImageFile = useCallback(
    async (file: File) => {
      setError(null);
      setLoading(true);
      setProgress(0);
      setStatusMessage("Preparando leitura da imagem (OCR)...");

      try {
        const { createWorker, PSM } = await import("tesseract.js");
        const worker = await createWorker("por", 1, {
          logger: (m) => {
            if (m.status === "recognizing text") {
              setProgress(Math.round((m.progress || 0) * 100));
              setStatusMessage("Lendo texto do comprovante...");
            } else if (m.status) {
              setStatusMessage("Carregando motor OCR em português...");
            }
          },
        });
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SINGLE_COLUMN,
        });

        const {
          data: { text },
        } = await worker.recognize(file);
        await worker.terminate();

        const parsed = parseReceiptText(text, "image");
        setReceipt(parsed);
        saveToHistory(parsed);
      } catch (err) {
        console.error("[OCR] Error:", err);
        setError(
          "Não foi possível ler a imagem. Tente uma captura de tela mais nítida."
        );
      } finally {
        setLoading(false);
        setProgress(null);
        setStatusMessage("");
      }
    },
    [saveToHistory]
  );

  const processPdfFile = useCallback(
    async (file: File) => {
      setError(null);
      setLoading(true);
      setProgress(null);
      setStatusMessage("Extraindo dados do PDF...");

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/parse-pdf", {
          method: "POST",
          body: formData,
        });
        const data = (await res.json()) as {
          receipt?: ParsedReceipt;
          error?: string;
        };

        if (!res.ok || !data.receipt) {
          throw new Error(data.error || "Erro ao processar PDF.");
        }

        setReceipt(data.receipt);
        saveToHistory(data.receipt);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Erro ao processar o PDF."
        );
      } finally {
        setLoading(false);
        setStatusMessage("");
      }
    },
    [saveToHistory]
  );

  const processUrl = useCallback(
    async (url: string) => {
      setError(null);
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

        setReceipt(data.receipt);
        saveToHistory(data.receipt);
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
    [saveToHistory]
  );

  const handleFileSelected = useCallback(
    async (file: File) => {
      const isPdf =
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");
      if (isPdf) {
        await processPdfFile(file);
      } else if (file.type.startsWith("image/") || /\.(png|jpe?g|webp|bmp)$/i.test(file.name)) {
        await processImageFile(file);
      } else {
        setError("Formato não suportado. Envie uma imagem ou PDF.");
      }
    },
    [processImageFile, processPdfFile]
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
          await handleFileSelected(file);
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
          setReceipt(parsed);
          saveToHistory(parsed);
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
        setReceipt(parsed);
        saveToHistory(parsed);
      }
    }
  }, [handleFileSelected, processUrl, saveToHistory]);

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
      setReceipt(parsed);
      saveToHistory(parsed);
    }
  };

  const handleCopy = async (label: string, value: string | null) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(label);
      setTimeout(() => setCopiedField(null), 1800);
    } catch {
      // ignore clipboard error
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setLinkInput(text.trim());
      }
    } catch {
      setError("Não foi possível acessar a área de transferência. Cole manualmente no campo.");
    }
  };

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setInstallPrompt(null);
    }
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 pb-16">
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

      {/* Header */}
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-900 text-white shadow-sm">
            <UserCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Pix Pães
            </h1>
            <p className="text-xs text-slate-500">
              Leitor de comprovantes Pix (Imagem, PDF ou Link)
            </p>
          </div>
        </div>

        {installPrompt && !isStandalone && (
          <button
            type="button"
            onClick={handleInstallClick}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-950 active:scale-95"
          >
            <Download className="h-4 w-4" />
            Instalar PWA
          </button>
        )}
      </header>

      {/* Upload & Link Input Area */}
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFileSelected(file);
            e.target.value = "";
          }}
        />

        <div className="flex flex-col gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50/50 px-4 py-4 text-sm font-semibold text-blue-900 transition hover:border-blue-500 hover:bg-blue-50 disabled:opacity-50"
          >
            <Upload className="h-5 w-5 text-blue-800" />
            <span>Enviar Foto ou PDF</span>
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
      </section>

      {/* Parsed Receipt Result */}
      {receipt && (
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-md">
          {/* Top Highlight Banner */}
          <div className="bg-blue-900 p-5 text-white">
            {/* Payer Name Hero */}
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-blue-200/80">
                Pagador
              </p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <h2 className="text-2xl font-bold leading-tight">
                  {receipt.payerName || "Nome não identificado"}
                </h2>
                {(receipt.payerName || receipt.amount) && (
                  <button
                    type="button"
                    onClick={() => {
                      const numericAmount = (receipt.amount || "")
                        .replace(/R\$\s*/gi, "")
                        .trim();
                      void handleCopy(
                        "payerName",
                        `${receipt.payerName || ""}\t${numericAmount}`
                      );
                    }}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/25"
                    title="Copiar nome do pagador e valor (2 colunas para planilha)"
                  >
                    {copiedField === "payerName" ? (
                      <>
                        <Check className="h-4 w-4" />
                        <span>Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Payer Details Grid: Valor, Data e Hora, Banco */}
          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-3">
            <DetailBox label="Valor" value={receipt.amount} />
            <DetailBox label="Data e Hora" value={receipt.dateTime} />
            <DetailBox label="Banco / Instituição" value={receipt.payerBank} />
          </div>

          {/* Collapsible Receiver Details */}
          <div className="border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowReceiver((v) => !v)}
              className="flex w-full items-center justify-between px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 hover:bg-slate-50"
            >
              <span>Recebedor</span>
              {showReceiver ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            {showReceiver && (
              <div className="grid grid-cols-1 gap-3 px-5 pb-4 sm:grid-cols-2">
                <DetailBox label="Nome" value={receipt.receiverName} />
                <DetailBox label="CPF / CNPJ" value={receipt.receiverDocument} />
                <DetailBox label="Banco" value={receipt.receiverBank} />
                <DetailBox label="Chave Pix" value={receipt.pixKey} />
              </div>
            )}
          </div>
        </section>
      )}

      {/* Empty State */}
      {!receipt && !loading && (
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
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setReceipt(item.receipt);
                }}
                className="flex items-center justify-between gap-3 py-2.5 text-left transition hover:bg-slate-50 px-2 rounded-xl"
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
              </button>
            ))}
          </div>
        </section>
      )}

      {/* PWA Share Tip (Bottom) */}
      {!isStandalone && (
        <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50/70 p-3.5 text-xs text-blue-950">
          <Share2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-800" />
          <div>
            <p className="font-semibold">
              Quer que o Pix Pães apareça no &ldquo;Compartilhar&rdquo; do celular?
            </p>
            <p className="mt-0.5 text-blue-900/90">
              Instale este app na tela inicial pelo menu do navegador (Android
              Chrome: <strong>Instalar aplicativo</strong>). Depois disso, basta
              compartilhar qualquer foto, PDF ou link do WhatsApp direto para o{" "}
              <strong>Pix Pães</strong>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailBox({
  label,
  value,
  mono = false,
  onCopy,
  copied = false,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
  onCopy?: () => void;
  copied?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {label}
        </p>
        <p
          className={`mt-0.5 break-all text-sm font-medium text-slate-900 ${
            mono ? "font-mono text-xs" : ""
          }`}
        >
          {value || "—"}
        </p>
      </div>
      {value && onCopy && (
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
          title={`Copiar ${label}`}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-blue-700" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    </div>
  );
}
