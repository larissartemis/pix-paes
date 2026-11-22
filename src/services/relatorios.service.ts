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

export const relatoriosService = {
  /**
   * Busca os `id_transacao` (endToEndId) que já existem na tabela `pix.relatorios`
   * dentre os IDs informados, para evitar duplicidade ao reenviar um PDF.
   */
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
  },

  /**
   * Mapeia uma linha extraída do PDF para o formato de inserção da tabela `pix.relatorios`.
   *
   * Correspondência:
   * - id_comprovante: null (será vinculado depois)
   * - id_cliente: null (será vinculado depois)
   * - nome_relatorio: coluna "Pagador" no PDF
   * - data_transacao: data a que se refere o relatório (YYYY-MM-DD, extraída da 2ª linha)
   * - hora_transacao: coluna "Hora" no PDF (HH:MM)
   * - valor: coluna "Valor" no PDF (numérico)
   * - id_transacao: coluna "endToEndId" no PDF
   * - conciliado: false
   * - created_at: timestamp da criação do registro
   */
  mapRowToInsert(
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
  },

  /**
   * Salva os itens extraídos do relatório na tabela `pix.relatorios`,
   * ignorando transações cujo `id_transacao` (endToEndId) já esteja cadastrado.
   */
  async saveReportItems(
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
      await this.findExistingTransactionIds(allIds);

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
      this.mapRowToInsert(item, fallbackDateIso)
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
  },
};
