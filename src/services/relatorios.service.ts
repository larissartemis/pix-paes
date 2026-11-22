import { supabase } from "@/lib/supabase";
import type { ReportPixRow } from "@/lib/report-parser";
import type { Tables, TablesInsert } from "@/types/database.types";

export type RelatorioRow = Tables<"relatorios">;
export type RelatorioInsert = TablesInsert<"relatorios">;

export interface SaveReportResult {
  insertedCount: number;
  skippedCount: number;
  savedIdsTransacao: string[];
  error: string | null;
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

export const relatoriosService = {
  getLatestUploadedReportDate,
  listAvailableReportDates,
  getRelatoriosByDate,
  updateConciliado,
  findExistingTransactionIds,
  mapRowToInsert,
  saveReportItems,
};
