import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database.types";

export type ClienteRow = Database["pix"]["Tables"]["clientes"]["Row"];
export type ClienteInsert = Database["pix"]["Tables"]["clientes"]["Insert"];
export type ClienteUpdate = Database["pix"]["Tables"]["clientes"]["Update"];
export type RotaTipo = Database["pix"]["Enums"]["rota_tipo"];

export const clientesService = {
  async list() {
    const { data, error } = await supabase
      .from("clientes")
      .select("*")
      .order("nome_loja", { ascending: true });

    return { data: data ?? [], error };
  },

  async create(payload: ClienteInsert) {
    const { data, error } = await supabase
      .from("clientes")
      .insert(payload)
      .select()
      .single();

    return { data, error };
  },

  async update(id: string, payload: ClienteUpdate) {
    const { data, error } = await supabase
      .from("clientes")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    return { data, error };
  },

  async toggleAtivo(id: string, ativo: boolean) {
    return this.update(id, { ativo });
  },
};
