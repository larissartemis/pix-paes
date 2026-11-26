import { supabase } from "@/lib/supabase";
import type { ParsedReceipt } from "@/lib/receipt-parser";
import type { ClienteRow } from "@/services/clientes.service";
import type { Tables, TablesInsert } from "@/types/database.types";

export type ComprovanteRow = Tables<"comprovantes">;
export type ComprovanteInsert = TablesInsert<"comprovantes">;

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Converte string monetária brasileira (ex.: "R$ 1.234,56") em número (1234.56).
 */
export function parseBrazilianAmount(amount: string | null): number | null {
  if (!amount) return null;
  const cleaned = amount
    .replace(/R\$\s*/gi, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Number(parsed.toFixed(2));
}

/**
 * Extrai data (YYYY-MM-DD) e hora (HH:MM) de strings como "22/11/2026 - 14:35:10", "22/11/2026 às 14:35"
 * ou fallback a partir do próprio endToEndId (E + 8 dígitos ISPB + YYYYMMDDHHMM + 11 caracteres).
 */
export function parseReceiptDateTime(
  dateTime: string | null,
  transactionId?: string | null
): {
  dataTransacao: string;
  horaTransacao: string;
} {
  let dataTransacao = "";
  let horaTransacao = "";

  if (dateTime) {
    const brDateMatch = dateTime.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (brDateMatch) {
      const [, day, month, year] = brDateMatch;
      dataTransacao = `${year}-${month}-${day}`;
    } else {
      const isoDateMatch = dateTime.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (isoDateMatch) {
        dataTransacao = isoDateMatch[0];
      }
    }

    const timeMatch = dateTime.match(/\b(\d{2}):(\d{2})(?::\d{2})?\b/);
    if (timeMatch) {
      horaTransacao = `${timeMatch[1]}:${timeMatch[2]}`;
    }
  }

  // Fallback: extract date from Pix endToEndId (format: E + 8 digits ISPB + YYYYMMDDHHMM + 11 chars)
  if (!dataTransacao && transactionId) {
    const e2eDateMatch = transactionId
      .trim()
      .match(/^E\d{8}(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(\d{2})(\d{2})/i);
    if (e2eDateMatch) {
      const [, yyyy, mm, dd] = e2eDateMatch;
      dataTransacao = `${yyyy}-${mm}-${dd}`;
    }
  }

  return { dataTransacao, horaTransacao };
}

export interface ClientSuggestion {
  cliente: ClienteRow;
  score: number;
  matchedBy: string;
}

const COMMON_SURNAMES = new Set([
  "dos",
  "das",
  "silva",
  "santos",
  "souza",
  "oliveira",
  "pereira",
  "ferreira",
  "almeida",
  "costa",
  "rodrigues",
  "alves",
  "lima",
  "gomes",
  "maria",
  "jose",
  "joao",
  "ana",
  "ltda",
]);

/**
 * Ranqueia clientes ativos que combinam com o nome do pagador extraído do comprovante.
 */
export function suggestClientesForReceipt(
  payerName: string | null,
  clientes: ClienteRow[]
): ClientSuggestion[] {
  const activeClientes = clientes.filter((c) => c.ativo);
  if (!payerName || !payerName.trim()) return [];

  const normPayer = normalizeText(payerName);
  if (!normPayer) return [];

  const payerWords = normPayer.split(" ").filter((w) => w.length >= 3);
  const distinctivePayerWords = payerWords.filter(
    (w) => !COMMON_SURNAMES.has(w)
  );
  const suggestions: ClientSuggestion[] = [];

  for (const cliente of activeClientes) {
    let bestScore = 0;
    let matchedBy = "";

    const candidates = [
      ...(cliente.nomes_comprovante ?? []).map((name) => ({
        name,
        weight: 100,
        source: "Nome no comprovante",
      })),
      { name: cliente.nome_loja, weight: 80, source: "Nome da loja" },
      ...(cliente.nomes_relatorio ?? []).map((name) => ({
        name,
        weight: 60,
        source: "Nome no relatório",
      })),
    ];

    for (const candidate of candidates) {
      const normCandidate = normalizeText(candidate.name);
      if (!normCandidate) continue;

      if (normCandidate === normPayer) {
        const score = candidate.weight + 50;
        if (score > bestScore) {
          bestScore = score;
          matchedBy = `${candidate.source}: ${candidate.name}`;
        }
        continue;
      }

      if (
        normCandidate.includes(normPayer) ||
        normPayer.includes(normCandidate)
      ) {
        const score = candidate.weight + 25;
        if (score > bestScore) {
          bestScore = score;
          matchedBy = `${candidate.source}: ${candidate.name}`;
        }
        continue;
      }

      const wordsToMatch =
        distinctivePayerWords.length >= 1 ? distinctivePayerWords : payerWords;
      if (wordsToMatch.length >= 2) {
        const candidateWords = normCandidate
          .split(" ")
          .filter((w) => w.length >= 3);
        const common = wordsToMatch.filter((w) => candidateWords.includes(w));
        if (common.length >= 2) {
          const score = candidate.weight - 15 + common.length * 5;
          if (score > bestScore) {
            bestScore = score;
            matchedBy = `${candidate.source}: ${candidate.name}`;
          }
        }
      }
    }

    if (bestScore > 0) {
      suggestions.push({ cliente, score: bestScore, matchedBy });
    }
  }

  const sorted = suggestions.sort((a, b) => b.score - a.score);
  if (sorted.length > 0 && sorted[0].score >= 120) {
    return sorted.filter((item) => item.score >= 100).slice(0, 5);
  }

  return sorted.slice(0, 5);
}

export function buildComprovanteDefaults(parsed: ParsedReceipt) {
  const valorNumero = parseBrazilianAmount(parsed.amount);
  const { dataTransacao, horaTransacao } = parseReceiptDateTime(
    parsed.dateTime,
    parsed.transactionId
  );

  return {
    nome_comprovante: parsed.payerName || "",
    valor: valorNumero !== null ? valorNumero.toFixed(2) : "",
    data_transacao: dataTransacao,
    hora_transacao: horaTransacao,
    id_transacao: parsed.transactionId || "",
    banco_pagador: parsed.payerBank || parsed.bankDetected || "",
    nome_recebedor: parsed.receiverName || "",
    cpf_cnpj_pagador: parsed.payerDocument || "",
    confianca_ocr: parsed.confidence || "",
  };
}

export interface SaveComprovanteResult {
  data: ComprovanteRow | null;
  error: string | null;
  reconciled: boolean;
}

export interface SaveBatchItemInput extends ComprovanteInsert {
  matched_relatorio_id?: string | null;
}

export interface SaveBatchResult {
  insertedCount: number;
  reconciledCount: number;
  skippedCount: number;
  error: string | null;
}

export interface ReceiptLookupCandidate {
  key: string;
  idTransacao: string;
  dataTransacao: string;
  horaTransacao: string;
  valor: string;
  nomeComprovante: string;
  candidateNames?: string[];
}

export interface RelatorioMatchCandidate {
  relatorioId: string;
  nomeRelatorio: string;
  dataTransacao: string;
  horaTransacao: string;
  valor: number;
  idTransacao: string | null;
  conciliado: boolean;
  idComprovante: string | null;
  matchReason: string;
}

function normalizeE2EForCompare(id: string | null | undefined): string {
  if (!id) return "";
  const trimmed = id.trim();
  if (!/^E[0-9A-Za-z]{20,}$/i.test(trimmed)) return trimmed.toLowerCase();
  const prefix = trimmed
    .slice(0, 21)
    .toUpperCase()
    .replace(/[O]/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/S/g, "5");
  const suffix = trimmed
    .slice(21)
    .toUpperCase()
    .replace(/[O]/g, "0");
  return `${prefix}${suffix}`.toLowerCase();
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const matrix: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

export function areTransactionIdsEquivalent(
  idA: string | null | undefined,
  idB: string | null | undefined
): boolean {
  const rawA = (idA || "").trim();
  const rawB = (idB || "").trim();
  if (!rawA || !rawB) return false;
  if (rawA.toLowerCase() === rawB.toLowerCase()) return true;

  const normA = normalizeE2EForCompare(rawA);
  const normB = normalizeE2EForCompare(rawB);
  if (normA === normB) return true;

  // Both are Pix E2E IDs with identical 21-char ISPB+timestamp prefix and <= 3 OCR character diffs
  if (
    normA.length >= 28 &&
    normB.length >= 28 &&
    normA.slice(0, 21) === normB.slice(0, 21) &&
    levenshteinDistance(normA, normB) <= 3
  ) {
    return true;
  }

  return false;
}

export function areNamesCompatibleForMatch(
  nameA: string | null | undefined,
  nameB: string | null | undefined
): boolean {
  const normA = normalizeText(
    (nameA || "").replace(/\b\d{2}\.\d{3}\.\d{3}\b/g, " ").replace(/\b\d{11,14}\b/g, " ")
  );
  const normB = normalizeText(
    (nameB || "").replace(/\b\d{2}\.\d{3}\.\d{3}\b/g, " ").replace(/\b\d{11,14}\b/g, " ")
  );
  if (!normA || !normB) return false;
  if (normA === normB) return true;
  if (normA.includes(normB) || normB.includes(normA)) return true;

  const stopWords = new Set(["de", "da", "do", "das", "dos", "e"]);
  const tokensA = normA.split(" ").filter((t) => t.length >= 2 && !stopWords.has(t));
  const tokensB = normB.split(" ").filter((t) => t.length >= 2 && !stopWords.has(t));
  if (tokensA.length === 0 || tokensB.length === 0) return false;

  if (tokensA[0] !== tokensB[0]) return false;
  if (tokensA.length === 1 || tokensB.length === 1) return true;

  const setB = new Set(tokensB.slice(1));
  return tokensA.slice(1).some((t) => setB.has(t));
}

function parseTimeToMinutes(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number.parseInt(m[1], 10) * 60 + Number.parseInt(m[2], 10);
}

export function isSameReceiptComposite(
  a: {
    idTransacao?: string | null;
    dataTransacao?: string | null;
    horaTransacao?: string | null;
    valor?: string | number | null;
    nomeComprovante?: string | null;
  },
  b: {
    idTransacao?: string | null;
    dataTransacao?: string | null;
    horaTransacao?: string | null;
    valor?: string | number | null;
    nomeComprovante?: string | null;
  }
): boolean {
  if (areTransactionIdsEquivalent(a.idTransacao, b.idTransacao)) {
    return true;
  }

  const dateA = (a.dataTransacao || "").trim();
  const dateB = (b.dataTransacao || "").trim();
  if (!dateA || !dateB || dateA !== dateB) return false;

  const centsA = Math.round(Number(a.valor || 0) * 100);
  const centsB = Math.round(Number(b.valor || 0) * 100);
  if (!centsA || !centsB || centsA !== centsB) return false;

  const minA = parseTimeToMinutes(a.horaTransacao);
  const minB = parseTimeToMinutes(b.horaTransacao);
  const namesMatch = areNamesCompatibleForMatch(a.nomeComprovante, b.nomeComprovante);

  // Same date, same value, same HH:MM time, and either compatible name or one is missing E2E ID
  if (minA !== null && minB !== null && minA === minB) {
    if (namesMatch || !a.idTransacao?.trim() || !b.idTransacao?.trim()) {
      return true;
    }
  }

  // Same date, same value, compatible name, and at least one lacks E2E ID or time
  if (
    namesMatch &&
    (!a.idTransacao?.trim() ||
      !b.idTransacao?.trim() ||
      minA === null ||
      minB === null)
  ) {
    return true;
  }

  return false;
}

export const comprovantesService = {
  async inspectReceiptCandidates(
    candidates: ReceiptLookupCandidate[]
  ): Promise<{
    duplicateDbKeys: Set<string>;
    matchedRelatorios: Map<string, RelatorioMatchCandidate>;
    error: string | null;
  }> {
    const duplicateDbKeys = new Set<string>();
    const matchedRelatorios = new Map<string, RelatorioMatchCandidate>();

    if (candidates.length === 0) {
      return { duplicateDbKeys, matchedRelatorios, error: null };
    }

    const [{ data: existingComps, error: compErr }, { data: allRelatorios, error: relErr }] =
      await Promise.all([
        supabase
          .from("comprovantes")
          .select("id, id_transacao, data_transacao, hora_transacao, valor, nome_comprovante"),
        supabase
          .from("relatorios")
          .select(
            "id, id_transacao, data_transacao, hora_transacao, valor, nome_relatorio, conciliado, id_comprovante"
          )
          .order("data_transacao", { ascending: true })
          .order("hora_transacao", { ascending: true }),
      ]);

    const errors = [
      compErr && `Erro ao verificar comprovantes: ${compErr.message}`,
      relErr && `Erro ao consultar relatórios: ${relErr.message}`,
    ].filter(Boolean);

    const compRows = existingComps ?? [];
    const relRows = allRelatorios ?? [];

    for (const cand of candidates) {
      const isDupInComps = compRows.some((row) =>
        isSameReceiptComposite(
          {
            idTransacao: cand.idTransacao,
            dataTransacao: cand.dataTransacao,
            horaTransacao: cand.horaTransacao,
            valor: cand.valor,
            nomeComprovante: cand.nomeComprovante,
          },
          {
            idTransacao: row.id_transacao,
            dataTransacao: row.data_transacao,
            horaTransacao: row.hora_transacao,
            valor: row.valor,
            nomeComprovante: row.nome_comprovante,
          }
        )
      );

      if (isDupInComps) {
        duplicateDbKeys.add(cand.key);
      }

      // Now look for matching row in relatorios
      const candTx = cand.idTransacao.trim();
      const candValorCents = Math.round(Number(cand.valor || 0) * 100);
      const candDate = cand.dataTransacao.trim();
      const candMinutes = parseTimeToMinutes(cand.horaTransacao);
      const allCandNames = Array.from(
        new Set(
          [cand.nomeComprovante, ...(cand.candidateNames ?? [])]
            .map((n) => n?.trim())
            .filter((n): n is string => Boolean(n))
        )
      );

      // 1. Direct or OCR-tolerant ID da transação match
      let matchedRel =
        candTx
          ? relRows.find((r) => areTransactionIdsEquivalent(candTx, r.id_transacao))
          : undefined;
      let matchReason = "ID da transação";

      // 2. Same date + exact value + compatible name (or very close time <= 5 min when E2E prefix matches)
      if (!matchedRel && candDate && candValorCents > 0) {
        const sameDateCandidates = relRows.filter((r) => {
          if (r.data_transacao !== candDate) return false;
          if (Math.round(Number(r.valor || 0) * 100) !== candValorCents) return false;
          const nameOk = allCandNames.some((n) =>
            areNamesCompatibleForMatch(n, r.nome_relatorio)
          );
          return nameOk;
        });

        if (sameDateCandidates.length > 0) {
          if (candMinutes !== null) {
            let best = sameDateCandidates[0];
            let bestDiff = Number.POSITIVE_INFINITY;
            for (const c of sameDateCandidates) {
              const relMin = parseTimeToMinutes(c.hora_transacao);
              const diff =
                relMin !== null ? Math.abs(relMin - candMinutes) : Number.MAX_SAFE_INTEGER;
              if (diff < bestDiff) {
                bestDiff = diff;
                best = c;
              }
            }
            matchedRel = best;
            matchReason =
              bestDiff <= 15
                ? "Valor, nome e horário na mesma data"
                : "Valor e nome na mesma data";
          } else {
            matchedRel = sameDateCandidates[0];
            matchReason = "Valor e nome na mesma data";
          }
        }
      }

      // 3. Future report date (relatorio.data_transacao > cand.dataTransacao) + exact value + compatible name
      if (!matchedRel && candDate && candValorCents > 0) {
        const futureCandidates = relRows.filter((r) => {
          if (r.conciliado || r.id_comprovante) return false;
          if (r.data_transacao <= candDate) return false;
          if (Math.round(Number(r.valor || 0) * 100) !== candValorCents) return false;
          return allCandNames.some((n) =>
            areNamesCompatibleForMatch(n, r.nome_relatorio)
          );
        });

        if (futureCandidates.length > 0) {
          matchedRel = futureCandidates[0];
          matchReason = "Valor e nome em relatório posterior";
        }
      }

      if (matchedRel) {
        if (matchedRel.id_comprovante) {
          // This report transaction already has a linked receipt in the database!
          duplicateDbKeys.add(cand.key);
        }
        matchedRelatorios.set(cand.key, {
          relatorioId: matchedRel.id,
          nomeRelatorio: matchedRel.nome_relatorio,
          dataTransacao: matchedRel.data_transacao,
          horaTransacao: matchedRel.hora_transacao || "",
          valor: Number(matchedRel.valor),
          idTransacao: matchedRel.id_transacao,
          conciliado: Boolean(matchedRel.conciliado),
          idComprovante: matchedRel.id_comprovante,
          matchReason,
        });
      }
    }

    return {
      duplicateDbKeys,
      matchedRelatorios,
      error: errors.length > 0 ? errors.join(" ") : null,
    };
  },

  async findReportDatesByTransactionIds(
    transactionIds: string[]
  ): Promise<{ reportDates: Map<string, string>; error: string | null }> {
    const validIds = Array.from(
      new Set(transactionIds.map((id) => id.trim()).filter(Boolean))
    );

    if (validIds.length === 0) {
      return { reportDates: new Map(), error: null };
    }

    const { data, error } = await supabase
      .from("relatorios")
      .select("id_transacao, data_transacao")
      .in("id_transacao", validIds);

    if (error) {
      return { reportDates: new Map(), error: error.message };
    }

    const reportDates = new Map<string, string>();
    for (const row of data ?? []) {
      if (row.id_transacao && row.data_transacao) {
        reportDates.set(row.id_transacao, row.data_transacao);
      }
    }

    return { reportDates, error: null };
  },

  async findExistingTransactionIds(
    transactionIds: string[]
  ): Promise<{ existingIds: Set<string>; error: string | null }> {
    const validIds = Array.from(
      new Set(transactionIds.map((id) => id.trim()).filter(Boolean))
    );

    if (validIds.length === 0) {
      return { existingIds: new Set(), error: null };
    }

    const { data, error } = await supabase
      .from("comprovantes")
      .select("id_transacao")
      .in("id_transacao", validIds);

    if (error) {
      return { existingIds: new Set(), error: error.message };
    }

    const existingIds = new Set<string>();
    for (const row of data ?? []) {
      if (row.id_transacao) {
        existingIds.add(row.id_transacao);
      }
    }

    return { existingIds, error: null };
  },

  async saveBatch(items: SaveBatchItemInput[]): Promise<SaveBatchResult> {
    if (items.length === 0) {
      return {
        insertedCount: 0,
        reconciledCount: 0,
        skippedCount: 0,
        error: "Nenhum comprovante selecionado para salvar.",
      };
    }

    const missingClient = items.some((item) => !item.id_cliente);
    if (missingClient) {
      return {
        insertedCount: 0,
        reconciledCount: 0,
        skippedCount: 0,
        error: "Todos os comprovantes selecionados precisam estar vinculados a um cliente.",
      };
    }

    const { data: existingComps, error: checkError } = await supabase
      .from("comprovantes")
      .select("id, id_transacao, data_transacao, hora_transacao, valor, nome_comprovante");

    if (checkError) {
      return {
        insertedCount: 0,
        reconciledCount: 0,
        skippedCount: 0,
        error: `Erro ao verificar comprovantes existentes: ${checkError.message}`,
      };
    }

    const existingRows = existingComps ?? [];
    const acceptedInBatch: SaveBatchItemInput[] = [];
    let skippedCount = 0;

    for (const item of items) {
      const txId = item.id_transacao?.trim() || null;
      const isDuplicateInDb = existingRows.some((row) =>
        isSameReceiptComposite(
          {
            idTransacao: txId,
            dataTransacao: item.data_transacao,
            horaTransacao: item.hora_transacao,
            valor: item.valor,
            nomeComprovante: item.nome_comprovante,
          },
          {
            idTransacao: row.id_transacao,
            dataTransacao: row.data_transacao,
            horaTransacao: row.hora_transacao,
            valor: row.valor,
            nomeComprovante: row.nome_comprovante,
          }
        )
      );

      const isDuplicateInBatch = acceptedInBatch.some((prev) =>
        isSameReceiptComposite(
          {
            idTransacao: txId,
            dataTransacao: item.data_transacao,
            horaTransacao: item.hora_transacao,
            valor: item.valor,
            nomeComprovante: item.nome_comprovante,
          },
          {
            idTransacao: prev.id_transacao,
            dataTransacao: prev.data_transacao,
            horaTransacao: prev.hora_transacao,
            valor: prev.valor,
            nomeComprovante: prev.nome_comprovante,
          }
        )
      );

      if (isDuplicateInDb || isDuplicateInBatch) {
        skippedCount++;
        continue;
      }

      acceptedInBatch.push({
        ...item,
        id_transacao: txId,
      });
    }

    if (acceptedInBatch.length === 0) {
      return {
        insertedCount: 0,
        reconciledCount: 0,
        skippedCount,
        error: null,
      };
    }

    const finalPayload: ComprovanteInsert[] = acceptedInBatch.map((item) => {
      const { matched_relatorio_id, ...rest } = item;
      return {
        ...rest,
        status: matched_relatorio_id
          ? ("conferido" as const)
          : ("aguardando_relatorio" as const),
      };
    });

    const { data: insertedRows, error: insertError } = await supabase
      .from("comprovantes")
      .insert(finalPayload)
      .select();

    if (insertError || !insertedRows) {
      return {
        insertedCount: 0,
        reconciledCount: 0,
        skippedCount,
        error: insertError?.message || "Erro ao salvar lote de comprovantes.",
      };
    }

    let reconciledCount = 0;
    for (let idx = 0; idx < insertedRows.length; idx++) {
      const inserted = insertedRows[idx];
      const relId = acceptedInBatch[idx]?.matched_relatorio_id;
      if (!inserted || !relId) continue;

      const { error: updateRelError } = await supabase
        .from("relatorios")
        .update({
          id_comprovante: inserted.id,
          id_cliente: inserted.id_cliente,
          conciliado: true,
        })
        .eq("id", relId);

      if (!updateRelError) {
        reconciledCount++;
      }
    }

    return {
      insertedCount: insertedRows.length,
      reconciledCount,
      skippedCount,
      error: null,
    };
  },

  async save(payload: ComprovanteInsert): Promise<SaveComprovanteResult> {
    if (!payload.id_cliente) {
      return {
        data: null,
        error: "É obrigatório vincular um cliente antes de salvar o comprovante.",
        reconciled: false,
      };
    }

    let matchingRelatorioId: string | null = null;

    if (payload.id_transacao) {
      const { data: existing, error: checkError } = await supabase
        .from("comprovantes")
        .select("id")
        .eq("id_transacao", payload.id_transacao)
        .maybeSingle();

      if (checkError) {
        return { data: null, error: checkError.message, reconciled: false };
      }

      if (existing) {
        return {
          data: null,
          error: "Este comprovante (ID da transação) já foi salvo anteriormente.",
          reconciled: false,
        };
      }

      const { data: relatorioMatch, error: relError } = await supabase
        .from("relatorios")
        .select("id")
        .eq("id_transacao", payload.id_transacao)
        .maybeSingle();

      if (relError) {
        return { data: null, error: relError.message, reconciled: false };
      }

      if (relatorioMatch) {
        matchingRelatorioId = relatorioMatch.id;
      }
    }

    const insertPayload: ComprovanteInsert = {
      ...payload,
      status: matchingRelatorioId ? "conferido" : payload.status ?? "aguardando_relatorio",
    };

    const { data, error } = await supabase
      .from("comprovantes")
      .insert(insertPayload)
      .select()
      .single();

    if (error || !data) {
      return {
        data: null,
        error: error?.message || "Não foi possível salvar o comprovante.",
        reconciled: false,
      };
    }

    if (matchingRelatorioId) {
      const { error: updateRelError } = await supabase
        .from("relatorios")
        .update({
          id_comprovante: data.id,
          id_cliente: payload.id_cliente,
          conciliado: true,
        })
        .eq("id", matchingRelatorioId);

      if (updateRelError) {
        return {
          data,
          error: `Comprovante salvo, mas não foi possível atualizar o relatório: ${updateRelError.message}`,
          reconciled: false,
        };
      }

      return { data, error: null, reconciled: true };
    }

    return { data, error: null, reconciled: false };
  },
};
