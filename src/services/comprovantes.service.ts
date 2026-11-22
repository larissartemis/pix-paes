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
 * Extrai data (YYYY-MM-DD) e hora (HH:MM) de strings como "22/11/2026 - 14:35:10" ou "22/11/2026 14:35".
 */
export function parseReceiptDateTime(dateTime: string | null): {
  dataTransacao: string;
  horaTransacao: string;
} {
  if (!dateTime) {
    return { dataTransacao: "", horaTransacao: "" };
  }

  let dataTransacao = "";
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

  let horaTransacao = "";
  const timeMatch = dateTime.match(/\b(\d{2}):(\d{2})(?::\d{2})?\b/);
  if (timeMatch) {
    horaTransacao = `${timeMatch[1]}:${timeMatch[2]}`;
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
  const { dataTransacao, horaTransacao } = parseReceiptDateTime(parsed.dateTime);

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

export interface SaveBatchResult {
  insertedCount: number;
  reconciledCount: number;
  skippedCount: number;
  error: string | null;
}

export const comprovantesService = {
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

  async saveBatch(items: ComprovanteInsert[]): Promise<SaveBatchResult> {
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

    const allIds = items
      .map((item) => item.id_transacao?.trim() || "")
      .filter(Boolean);

    const { existingIds, error: checkError } =
      await this.findExistingTransactionIds(allIds);

    if (checkError) {
      return {
        insertedCount: 0,
        reconciledCount: 0,
        skippedCount: 0,
        error: `Erro ao verificar comprovantes existentes: ${checkError}`,
      };
    }

    const seenInBatch = new Set<string>();
    const toInsert: ComprovanteInsert[] = [];
    let skippedCount = 0;

    for (const item of items) {
      const txId = item.id_transacao?.trim() || null;
      if (txId) {
        if (existingIds.has(txId) || seenInBatch.has(txId)) {
          skippedCount++;
          continue;
        }
        seenInBatch.add(txId);
      }
      toInsert.push({
        ...item,
        id_transacao: txId,
      });
    }

    if (toInsert.length === 0) {
      return {
        insertedCount: 0,
        reconciledCount: 0,
        skippedCount,
        error: null,
      };
    }

    const newTxIds = toInsert
      .map((item) => item.id_transacao)
      .filter((id): id is string => Boolean(id));

    const relatorioByTxId = new Map<string, string>();
    if (newTxIds.length > 0) {
      const { data: relMatches, error: relError } = await supabase
        .from("relatorios")
        .select("id, id_transacao")
        .in("id_transacao", newTxIds);

      if (relError) {
        return {
          insertedCount: 0,
          reconciledCount: 0,
          skippedCount,
          error: `Erro ao consultar relatórios: ${relError.message}`,
        };
      }

      for (const rel of relMatches ?? []) {
        if (rel.id_transacao) {
          relatorioByTxId.set(rel.id_transacao, rel.id);
        }
      }
    }

    const finalPayload = toInsert.map((item) => ({
      ...item,
      status:
        item.id_transacao && relatorioByTxId.has(item.id_transacao)
          ? ("conferido" as const)
          : ("aguardando_relatorio" as const),
    }));

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
    for (const inserted of insertedRows) {
      if (!inserted.id_transacao) continue;
      const relId = relatorioByTxId.get(inserted.id_transacao);
      if (!relId) continue;

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
