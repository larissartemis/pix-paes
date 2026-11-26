import { supabase } from "@/lib/supabase";
import type { ReportPixRow } from "@/lib/report-parser";
import { areTransactionIdsEquivalent } from "@/services/comprovantes.service";
import type { Tables, TablesInsert } from "@/types/database.types";

export type RelatorioRow = Tables<"relatorios">;
export type RelatorioInsert = TablesInsert<"relatorios">;
export type ComprovanteRow = Tables<"comprovantes">;

export interface ReconcileMatchItem {
  relatorioId: string;
  comprovanteId: string;
  nomeRelatorio: string;
  nomeComprovante: string;
  valor: number;
  dataRelatorio: string;
  dataComprovante: string;
  matchBy: "id_transacao" | "nome_valor_hora" | "nome_valor";
  sameDate: boolean;
}

export interface ReconcileReportResult {
  matchedCount: number;
  matchedSameDateCount: number;
  matchedFutureDateCount: number;
  matches: ReconcileMatchItem[];
  error: string | null;
}

export interface SaveReportResult {
  insertedCount: number;
  skippedCount: number;
  savedIdsTransacao: string[];
  error: string | null;
}

export interface UploadedReportSummary {
  dataTransacao: string; // YYYY-MM-DD
  totalPix: number;
  conferidosPix: number;
  pendentesPix: number;
  valorTotal: number;
  valorConferido: number;
  ultimoUploadEm: string;
}

/**
 * Retorna um resumo agrupado por `data_transacao` de todos os relatórios já enviados:
 * quantidade de PIX, quantos foram conferidos, pendentes, valor total, valor conferido
 * e data do último envio.
 */
export async function listUploadedReportsSummary(): Promise<{
  summaries: UploadedReportSummary[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("relatorios")
    .select("data_transacao, valor, conciliado, created_at")
    .order("data_transacao", { ascending: false });

  if (error) {
    return { summaries: [], error: error.message };
  }

  const map = new Map<string, UploadedReportSummary>();

  for (const row of data ?? []) {
    const dateKey = row.data_transacao;
    if (!dateKey) continue;

    const valorNum = Number(row.valor || 0);
    const isConferido = Boolean(row.conciliado);
    const createdAt = row.created_at || "";

    const existing = map.get(dateKey);
    if (!existing) {
      map.set(dateKey, {
        dataTransacao: dateKey,
        totalPix: 1,
        conferidosPix: isConferido ? 1 : 0,
        pendentesPix: isConferido ? 0 : 1,
        valorTotal: valorNum,
        valorConferido: isConferido ? valorNum : 0,
        ultimoUploadEm: createdAt,
      });
    } else {
      existing.totalPix += 1;
      if (isConferido) {
        existing.conferidosPix += 1;
        existing.valorConferido =
          Math.round((existing.valorConferido + valorNum) * 100) / 100;
      } else {
        existing.pendentesPix += 1;
      }
      existing.valorTotal =
        Math.round((existing.valorTotal + valorNum) * 100) / 100;
      if (createdAt > existing.ultimoUploadEm) {
        existing.ultimoUploadEm = createdAt;
      }
    }
  }

  const summaries = Array.from(map.values()).sort((a, b) =>
    b.dataTransacao.localeCompare(a.dataTransacao)
  );

  return { summaries, error: null };
}

/**
 * Busca a data (`data_transacao`) do último relatório enviado ao banco
 * (ordenando pelo registro criado mais recentemente em `created_at`).
 */
export async function getLatestUploadedReportDate(): Promise<{
  date: string | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("relatorios")
    .select("data_transacao, created_at")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    return { date: null, error: error.message };
  }

  const latest = data?.[0]?.data_transacao ?? null;
  return { date: latest, error: null };
}

/**
 * Lista as datas disponíveis (`data_transacao` distintas) na tabela `relatorios`,
 * ordenadas da mais recente para a mais antiga.
 */
export async function listAvailableReportDates(): Promise<{
  dates: string[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("relatorios")
    .select("data_transacao")
    .order("data_transacao", { ascending: false });

  if (error) {
    return { dates: [], error: error.message };
  }

  const uniqueDates = Array.from(
    new Set((data ?? []).map((r) => r.data_transacao).filter(Boolean))
  );
  return { dates: uniqueDates, error: null };
}

/**
 * Busca todos os registros de `relatorios` de uma determinada `data_transacao` (YYYY-MM-DD).
 */
export async function getRelatoriosByDate(dateIso: string): Promise<{
  data: RelatorioRow[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("relatorios")
    .select("*")
    .eq("data_transacao", dateIso)
    .order("hora_transacao", { ascending: true });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: data ?? [], error: null };
}

/**
 * Alterna ou atualiza o status `conciliado` (true/false) de um registro em `relatorios`.
 */
export async function updateConciliado(
  id: string,
  conciliado: boolean
): Promise<{ data: RelatorioRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("relatorios")
    .update({ conciliado })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

/**
 * Busca os `id_transacao` (endToEndId) que já existem na tabela `pix.relatorios`
 * dentre os IDs informados, para evitar duplicidade ao reenviar um PDF.
 */
export async function findExistingTransactionIds(
  transactionIds: string[]
): Promise<{ existingIds: Set<string>; error: string | null }> {
  const validIds = Array.from(
    new Set(transactionIds.map((id) => id.trim()).filter(Boolean))
  );

  if (validIds.length === 0) {
    return { existingIds: new Set(), error: null };
  }

  const { data, error } = await supabase
    .from("relatorios")
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
}

/**
 * Mapeia uma linha extraída do PDF para o formato de inserção da tabela `pix.relatorios`.
 */
export function mapRowToInsert(
  item: ReportPixRow,
  fallbackDateIso?: string | null
): RelatorioInsert {
  return {
    id_comprovante: null,
    id_cliente: null,
    nome_relatorio: item.nomeRelatorio,
    data_transacao: item.dataTransacao || fallbackDateIso || "",
    hora_transacao: item.horaTransacao,
    valor: item.valor,
    id_transacao: item.idTransacao,
    conciliado: false,
    created_at: new Date().toISOString(),
  };
}

/**
 * Salva os itens extraídos do relatório na tabela `pix.relatorios`,
 * ignorando transações cujo `id_transacao` (endToEndId) já esteja cadastrado.
 */
export async function saveReportItems(
  items: ReportPixRow[],
  fallbackDateIso?: string | null
): Promise<SaveReportResult> {
  if (items.length === 0) {
    return {
      insertedCount: 0,
      skippedCount: 0,
      savedIdsTransacao: [],
      error: "Nenhum item para salvar.",
    };
  }

  const dataTransacao = items[0]?.dataTransacao || fallbackDateIso;
  if (!dataTransacao) {
    return {
      insertedCount: 0,
      skippedCount: 0,
      savedIdsTransacao: [],
      error:
        "Data da transação não identificada no relatório. Verifique o cabeçalho do PDF.",
    };
  }

  const allIds = items.map((item) => item.idTransacao).filter(Boolean);
  const { existingIds, error: checkError } =
    await findExistingTransactionIds(allIds);

  if (checkError) {
    return {
      insertedCount: 0,
      skippedCount: 0,
      savedIdsTransacao: [],
      error: `Erro ao verificar registros existentes: ${checkError}`,
    };
  }

  const newItems = items.filter(
    (item) => !item.idTransacao || !existingIds.has(item.idTransacao)
  );
  const skippedCount = items.length - newItems.length;

  if (newItems.length === 0) {
    return {
      insertedCount: 0,
      skippedCount,
      savedIdsTransacao: Array.from(existingIds),
      error: null,
    };
  }

  const payload: RelatorioInsert[] = newItems.map((item) =>
    mapRowToInsert(item, fallbackDateIso)
  );

  const { error: insertError } = await supabase
    .from("relatorios")
    .insert(payload);

  if (insertError) {
    return {
      insertedCount: 0,
      skippedCount,
      savedIdsTransacao: Array.from(existingIds),
      error: `Erro ao salvar no Supabase: ${insertError.message}`,
    };
  }

  const allSavedIds = new Set<string>(existingIds);
  for (const item of newItems) {
    if (item.idTransacao) {
      allSavedIds.add(item.idTransacao);
    }
  }

  return {
    insertedCount: newItems.length,
    skippedCount,
    savedIdsTransacao: Array.from(allSavedIds),
    error: null,
  };
}

function normalizePersonName(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    // Remove leading/trailing CNPJ/CPF fragments often present in bank/Metabase names
    .replace(/\b\d{2}\.\d{3}\.\d{3}\b/g, " ")
    .replace(/\b\d{11,14}\b/g, " ")
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function areNamesCompatible(nameA: string, nameB: string): boolean {
  const normA = normalizePersonName(nameA);
  const normB = normalizePersonName(nameB);
  if (!normA || !normB) return false;
  if (normA === normB) return true;
  if (normA.includes(normB) || normB.includes(normA)) return true;

  const stopWords = new Set(["DE", "DA", "DO", "DAS", "DOS", "E"]);
  const tokensA = normA
    .split(" ")
    .filter((t) => t.length >= 2 && !stopWords.has(t));
  const tokensB = normB
    .split(" ")
    .filter((t) => t.length >= 2 && !stopWords.has(t));

  if (tokensA.length === 0 || tokensB.length === 0) return false;

  // First name must match and at least one other significant token must match
  if (tokensA[0] !== tokensB[0]) return false;
  if (tokensA.length === 1 || tokensB.length === 1) return true;

  const setB = new Set(tokensB.slice(1));
  const sharedRest = tokensA.slice(1).filter((t) => setB.has(t));
  return sharedRest.length >= 1;
}

function parseTimeToMinutes(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number.parseInt(m[1], 10) * 60 + Number.parseInt(m[2], 10);
}

/**
 * Procura novos matches entre comprovantes que ainda não foram vinculados a nenhum relatório
 * e registros de relatórios pendentes (`conciliado = false` e `id_comprovante IS NULL`).
 *
 * Regra de busca:
 * 1. Prioriza procurar matches na própria data (`targetDateIso` / mesma data do comprovante).
 * 2. Caso um comprovante não encontre match na mesma data, procura em relatórios de datas futuras
 *    (`relatorio.data_transacao >= comprovante.data_transacao`), pois o cliente pode pagar 1 ou 2 dias depois.
 * 3. Ao encontrar match (por `id_transacao` / endToEndId, ou por Valor + Nome compatível + proximidade de horário/data):
 *    - Atualiza `pix.relatorios`: `id_comprovante`, `id_cliente` (se houver no comprovante) e `conciliado = true`
 *    - Atualiza `pix.comprovantes`: `status = "conferido"`
 */
export async function reconcilePendingWithReport(
  targetDateIso?: string | null
): Promise<ReconcileReportResult> {
  // 1. Buscar todos os relatórios para saber quais comprovantes já estão vinculados
  //    e quais linhas de relatório ainda estão pendentes
  const { data: allRelatorios, error: relErr } = await supabase
    .from("relatorios")
    .select("*")
    .order("data_transacao", { ascending: true })
    .order("hora_transacao", { ascending: true });

  if (relErr) {
    return {
      matchedCount: 0,
      matchedSameDateCount: 0,
      matchedFutureDateCount: 0,
      matches: [],
      error: `Erro ao consultar relatórios para conferência: ${relErr.message}`,
    };
  }

  // 2. Buscar comprovantes com status pendente (ou aguardando_relatorio) ainda não vinculados
  const { data: allComprovantes, error: compErr } = await supabase
    .from("comprovantes")
    .select("*")
    .in("status", ["pendente", "aguardando_relatorio"])
    .order("data_transacao", { ascending: true })
    .order("hora_transacao", { ascending: true });

  if (compErr) {
    return {
      matchedCount: 0,
      matchedSameDateCount: 0,
      matchedFutureDateCount: 0,
      matches: [],
      error: `Erro ao consultar comprovantes: ${compErr.message}`,
    };
  }

  const relatoriosList = allRelatorios ?? [];
  const comprovantesList = allComprovantes ?? [];

  // Comprovantes que já estão referenciados em algum relatório
  const alreadyLinkedComprovanteIds = new Set<string>();
  for (const r of relatoriosList) {
    if (r.id_comprovante) {
      alreadyLinkedComprovanteIds.add(r.id_comprovante);
    }
  }

  // Comprovantes candidatos (ainda não vinculados a nenhum relatório)
  const unlinkedComprovantes = comprovantesList.filter(
    (c) => !alreadyLinkedComprovanteIds.has(c.id)
  );

  // Relatórios candidatos (ainda não conferidos e sem comprovante vinculado)
  // Se targetDateIso foi informado, incluímos relatórios daquela data e de datas futuras
  const availableRelatorios = relatoriosList.filter((r) => {
    if (r.conciliado || r.id_comprovante) return false;
    if (targetDateIso && r.data_transacao < targetDateIso) {
      // Ainda assim permite se o comprovante for da data anterior e o relatório atual for targetDateIso
      return false;
    }
    return true;
  });

  if (unlinkedComprovantes.length === 0 || availableRelatorios.length === 0) {
    return {
      matchedCount: 0,
      matchedSameDateCount: 0,
      matchedFutureDateCount: 0,
      matches: [],
      error: null,
    };
  }

  const usedRelatorioIds = new Set<string>();
  const usedComprovanteIds = new Set<string>();
  const matches: ReconcileMatchItem[] = [];

  // Ordena comprovantes priorizando os da própria data selecionada (targetDateIso)
  const sortedComprovantes = [...unlinkedComprovantes].sort((a, b) => {
    const aIsTarget = targetDateIso && a.data_transacao === targetDateIso ? 0 : 1;
    const bIsTarget = targetDateIso && b.data_transacao === targetDateIso ? 0 : 1;
    if (aIsTarget !== bIsTarget) return aIsTarget - bIsTarget;
    return a.data_transacao.localeCompare(b.data_transacao);
  });

  const tryMatchComprovante = (
    comp: ComprovanteRow,
    candidateRelatorios: RelatorioRow[]
  ): {
    relatorio: RelatorioRow;
    matchBy: "id_transacao" | "nome_valor_hora" | "nome_valor";
  } | null => {
    const compIdTransacao = (comp.id_transacao || "").trim();

    // Critério 1: Match exato ou tolerante a OCR por ID da transação (endToEndId)
    if (compIdTransacao) {
      const exactIdMatch = candidateRelatorios.find(
        (r) =>
          !usedRelatorioIds.has(r.id) &&
          areTransactionIdsEquivalent(compIdTransacao, r.id_transacao)
      );
      if (exactIdMatch) {
        return { relatorio: exactIdMatch, matchBy: "id_transacao" };
      }
    }

    // Critério 2: Match por Valor exato + Nome compatível (+ menor diferença de horário se houver)
    const compValor = Math.round(Number(comp.valor) * 100);
    const compMinutes = parseTimeToMinutes(comp.hora_transacao);

    const valueAndNameCandidates = candidateRelatorios.filter((r) => {
      if (usedRelatorioIds.has(r.id)) return false;
      const relValor = Math.round(Number(r.valor) * 100);
      if (relValor !== compValor) return false;
      return areNamesCompatible(comp.nome_comprovante, r.nome_relatorio);
    });

    if (valueAndNameCandidates.length === 0) return null;

    if (compMinutes !== null) {
      let bestCandidate: RelatorioRow | null = null;
      let bestTimeDiff = Number.POSITIVE_INFINITY;

      for (const cand of valueAndNameCandidates) {
        const relMinutes = parseTimeToMinutes(cand.hora_transacao);
        const diff =
          relMinutes !== null
            ? Math.abs(relMinutes - compMinutes)
            : Number.MAX_SAFE_INTEGER;
        if (diff < bestTimeDiff) {
          bestTimeDiff = diff;
          bestCandidate = cand;
        }
      }

      if (bestCandidate) {
        return {
          relatorio: bestCandidate,
          matchBy: bestTimeDiff <= 15 ? "nome_valor_hora" : "nome_valor",
        };
      }
    }

    return {
      relatorio: valueAndNameCandidates[0],
      matchBy: "nome_valor",
    };
  };

  for (const comp of sortedComprovantes) {
    if (usedComprovanteIds.has(comp.id)) continue;

    // Passo 1: Procurar na MESMA data do comprovante (ou na data do relatório alvo, se igual)
    const sameDateCandidates = availableRelatorios.filter(
      (r) =>
        !usedRelatorioIds.has(r.id) && r.data_transacao === comp.data_transacao
    );

    let found = tryMatchComprovante(comp, sameDateCandidates);

    // Passo 2: Se não achou na mesma data, procurar em datas FUTURAS (ex.: cliente pagou 1 ou 2 dias depois,
    // ou comprovante foi registrado com data anterior ao relatório)
    if (!found) {
      const futureDateCandidates = availableRelatorios
        .filter(
          (r) =>
            !usedRelatorioIds.has(r.id) &&
            r.data_transacao > comp.data_transacao
        )
        .sort((a, b) => a.data_transacao.localeCompare(b.data_transacao));

      found = tryMatchComprovante(comp, futureDateCandidates);
    }

    // Passo 3: Caso o usuário tenha iniciado a conferência de `targetDateIso` e o relatório seja de `targetDateIso`
    // ou futuro, persiste o vínculo
    if (found) {
      const { relatorio, matchBy } = found;
      usedRelatorioIds.add(relatorio.id);
      usedComprovanteIds.add(comp.id);

      const nextIdCliente = relatorio.id_cliente || comp.id_cliente || null;

      const [{ error: upRelErr }, { error: upCompErr }] = await Promise.all([
        supabase
          .from("relatorios")
          .update({
            conciliado: true,
            id_comprovante: comp.id,
            id_cliente: nextIdCliente,
          })
          .eq("id", relatorio.id),
        supabase
          .from("comprovantes")
          .update({
            status: "conferido",
          })
          .eq("id", comp.id),
      ]);

      if (!upRelErr && !upCompErr) {
        matches.push({
          relatorioId: relatorio.id,
          comprovanteId: comp.id,
          nomeRelatorio: relatorio.nome_relatorio,
          nomeComprovante: comp.nome_comprovante,
          valor: Number(relatorio.valor),
          dataRelatorio: relatorio.data_transacao,
          dataComprovante: comp.data_transacao,
          matchBy,
          sameDate: relatorio.data_transacao === comp.data_transacao,
        });
      }
    }
  }

  const matchedSameDateCount = matches.filter((m) => m.sameDate).length;
  const matchedFutureDateCount = matches.length - matchedSameDateCount;

  return {
    matchedCount: matches.length,
    matchedSameDateCount,
    matchedFutureDateCount,
    matches,
    error: null,
  };
}

export const relatoriosService = {
  getLatestUploadedReportDate,
  listAvailableReportDates,
  listUploadedReportsSummary,
  getRelatoriosByDate,
  updateConciliado,
  findExistingTransactionIds,
  mapRowToInsert,
  saveReportItems,
  reconcilePendingWithReport,
};
