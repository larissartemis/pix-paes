"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Users,
  X,
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
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  type ClienteRow,
  type RotaTipo,
  clientesService,
} from "@/services/clientes.service";

interface ClienteFormState {
  nome_loja: string;
  cidade: string;
  rota: RotaTipo | "";
  telefone: string;
  ativo: boolean;
  nomes_comprovante: string[];
  nomes_relatorio: string[];
}

const EMPTY_FORM: ClienteFormState = {
  nome_loja: "",
  cidade: "",
  rota: "",
  telefone: "",
  ativo: true,
  nomes_comprovante: [],
  nomes_relatorio: [],
};

function formatRotaLabel(rota: RotaTipo | null) {
  if (rota === "rota_1") return "Rota 1";
  if (rota === "rota_2") return "Rota 2";
  return null;
}

interface TagListInputProps {
  id: string;
  label: string;
  placeholder: string;
  values: string[];
  onChange: (next: string[]) => void;
}

function TagListInput({
  id,
  label,
  placeholder,
  values,
  onChange,
}: TagListInputProps) {
  const [draft, setDraft] = useState("");

  function addTag() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    const exists = values.some(
      (item) => item.toLowerCase() === trimmed.toLowerCase()
    );
    if (!exists) {
      onChange([...values, trimmed]);
    }
    setDraft("");
  }

  function removeTag(index: number) {
    onChange(values.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag();
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
        />
        <Button type="button" variant="outline" onClick={addTag}>
          <Plus className="h-4 w-4" />
          Adicionar
        </Button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {values.map((tag, index) => (
            <Badge
              key={`${tag}-${index}`}
              variant="secondary"
              className="gap-1 pr-1.5"
            >
              <span>{tag}</span>
              <button
                type="button"
                onClick={() => removeTag(index)}
                aria-label={`Remover ${tag}`}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ClientesPage() {
  const [clientes, setClientes] = useState<ClienteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "ativos" | "inativos">("ativos");
  const [rotaFilter, setRotaFilter] = useState<"todas" | RotaTipo>("todas");

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ClienteFormState>(EMPTY_FORM);

  const loadClientes = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: listError } = await clientesService.list();
    setLoading(false);

    if (listError) {
      setError(`Não foi possível carregar os clientes: ${listError.message}`);
      return;
    }

    setClientes(data);
  }, []);

  useEffect(() => {
    loadClientes();
  }, [loadClientes]);

  const filteredClientes = useMemo(() => {
    const query = search.trim().toLowerCase();

    return clientes.filter((cliente) => {
      if (statusFilter === "ativos" && !cliente.ativo) return false;
      if (statusFilter === "inativos" && cliente.ativo) return false;
      if (rotaFilter !== "todas" && cliente.rota !== rotaFilter) return false;

      if (!query) return true;

      const haystack = [
        cliente.nome_loja,
        cliente.cidade ?? "",
        cliente.telefone ?? "",
        ...cliente.nomes_comprovante,
        ...cliente.nomes_relatorio,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [clientes, search, statusFilter, rotaFilter]);

  function openNewForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setFeedback(null);
    setFormOpen(true);
  }

  function openEditForm(cliente: ClienteRow) {
    setEditingId(cliente.id);
    setForm({
      nome_loja: cliente.nome_loja,
      cidade: cliente.cidade ?? "",
      rota: cliente.rota ?? "",
      telefone: cliente.telefone ?? "",
      ativo: cliente.ativo,
      nomes_comprovante: cliente.nomes_comprovante ?? [],
      nomes_relatorio: cliente.nomes_relatorio ?? [],
    });
    setError(null);
    setFeedback(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFeedback(null);

    const nomeLoja = form.nome_loja.trim();
    if (!nomeLoja) {
      setError("Informe o nome do cliente ou loja.");
      return;
    }

    const payload = {
      nome_loja: nomeLoja,
      cidade: form.cidade.trim() || null,
      rota: form.rota || null,
      telefone: form.telefone.trim() || null,
      ativo: form.ativo,
      nomes_comprovante: form.nomes_comprovante,
      nomes_relatorio: form.nomes_relatorio,
    };

    setSaving(true);

    if (editingId) {
      const { data, error: updateError } = await clientesService.update(
        editingId,
        payload
      );
      setSaving(false);

      if (updateError || !data) {
        setError("Não foi possível atualizar o cliente.");
        return;
      }

      setClientes((prev) =>
        prev
          .map((item) => (item.id === editingId ? data : item))
          .sort((a, b) => a.nome_loja.localeCompare(b.nome_loja))
      );
      setFeedback(`Cliente "${data.nome_loja}" atualizado.`);
      closeForm();
      return;
    }

    const { data, error: createError } = await clientesService.create(payload);
    setSaving(false);

    if (createError || !data) {
      setError("Não foi possível cadastrar o cliente.");
      return;
    }

    setClientes((prev) =>
      [...prev, data].sort((a, b) => a.nome_loja.localeCompare(b.nome_loja))
    );
    setFeedback(`Cliente "${data.nome_loja}" cadastrado.`);
    closeForm();
  }

  async function handleToggleAtivo(cliente: ClienteRow) {
    setError(null);
    setFeedback(null);
    const { data, error: toggleError } = await clientesService.toggleAtivo(
      cliente.id,
      !cliente.ativo
    );

    if (toggleError || !data) {
      setError("Não foi possível alterar o status do cliente.");
      return;
    }

    setClientes((prev) =>
      prev.map((item) => (item.id === cliente.id ? data : item))
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Clientes
          </h1>
          <p className="text-sm text-muted-foreground">
            Cadastre lojas, rotas e os nomes que aparecem nos comprovantes e relatórios.
          </p>
        </div>

        <Button onClick={openNewForm} className="sm:w-auto">
          <Plus className="h-4 w-4" />
          Novo cliente
        </Button>
      </div>

      {feedback && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {formOpen && (
        <Card className="border-primary/25">
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle>
                {editingId ? "Editar cliente" : "Novo cliente"}
              </CardTitle>
              <CardDescription>
                Adicione os nomes exatos que costumam vir no Pix e no relatório.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={closeForm}
              aria-label="Fechar formulário"
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="nome-loja">Nome do Cliente / Loja *</Label>
                  <Input
                    id="nome-loja"
                    required
                    value={form.nome_loja}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, nome_loja: e.target.value }))
                    }
                    placeholder="Ex.: Padaria Central / Mercado Silva"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cidade">Cidade</Label>
                  <Input
                    id="cidade"
                    value={form.cidade}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, cidade: e.target.value }))
                    }
                    placeholder="Ex.: Campinas"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="rota">Rota</Label>
                  <select
                    id="rota"
                    value={form.rota}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        rota: e.target.value as RotaTipo | "",
                      }))
                    }
                    className="flex h-10 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground shadow-xs transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
                  >
                    <option value="">Sem rota definida</option>
                    <option value="rota_1">Rota 1</option>
                    <option value="rota_2">Rota 2</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="telefone">Telefone</Label>
                  <Input
                    id="telefone"
                    type="tel"
                    value={form.telefone}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, telefone: e.target.value }))
                    }
                    placeholder="(11) 99999-9999"
                  />
                </div>

                <div className="flex items-end pb-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
                    <input
                      type="checkbox"
                      checked={form.ativo}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, ativo: e.target.checked }))
                      }
                      className="h-4 w-4 rounded border-input accent-primary"
                    />
                    Cliente ativo
                  </label>
                </div>
              </div>

              <TagListInput
                id="nomes-comprovante"
                label="Nomes no Comprovante (pagador Pix)"
                placeholder="Digite o nome e pressione Enter"
                values={form.nomes_comprovante}
                onChange={(next) =>
                  setForm((prev) => ({ ...prev, nomes_comprovante: next }))
                }
              />

              <TagListInput
                id="nomes-relatorio"
                label="Nomes no Relatório"
                placeholder="Digite o nome e pressione Enter"
                values={form.nomes_relatorio}
                onChange={(next) =>
                  setForm((prev) => ({ ...prev, nomes_relatorio: next }))
                }
              />

              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={closeForm}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : editingId ? (
                    "Salvar alterações"
                  ) : (
                    "Cadastrar cliente"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por loja, cidade ou nome no Pix..."
                className="pl-10"
              />
            </div>

            <div className="flex gap-2">
              <select
                aria-label="Filtrar por status"
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(
                    e.target.value as "todos" | "ativos" | "inativos"
                  )
                }
                className="h-10 rounded-xl border border-input bg-card px-3 text-sm text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
              >
                <option value="ativos">Ativos</option>
                <option value="inativos">Inativos</option>
                <option value="todos">Todos</option>
              </select>

              <select
                aria-label="Filtrar por rota"
                value={rotaFilter}
                onChange={(e) =>
                  setRotaFilter(e.target.value as "todas" | RotaTipo)
                }
                className="h-10 rounded-xl border border-input bg-card px-3 text-sm text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
              >
                <option value="todas">Todas as rotas</option>
                <option value="rota_1">Rota 1</option>
                <option value="rota_2">Rota 2</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <p className="text-sm font-medium">Carregando clientes...</p>
        </div>
      ) : filteredClientes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Users className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              Nenhum cliente encontrado
            </p>
            <p className="text-xs text-muted-foreground">
              {clientes.length === 0
                ? 'Clique em "Novo cliente" para fazer o primeiro cadastro.'
                : "Tente ajustar os filtros ou o termo de busca."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredClientes.map((cliente) => {
            const rotaLabel = formatRotaLabel(cliente.rota);
            return (
              <Card
                key={cliente.id}
                className={cn(!cliente.ativo && "opacity-70")}
              >
                <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-foreground">
                        {cliente.nome_loja}
                      </h2>
                      <Badge variant={cliente.ativo ? "success" : "secondary"}>
                        {cliente.ativo ? "Ativo" : "Inativo"}
                      </Badge>
                      {rotaLabel && <Badge variant="outline">{rotaLabel}</Badge>}
                    </div>

                    {(cliente.cidade || cliente.telefone) && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {cliente.cidade && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {cliente.cidade}
                          </span>
                        )}
                        {cliente.telefone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5" />
                            {cliente.telefone}
                          </span>
                        )}
                      </div>
                    )}

                    {cliente.nomes_comprovante.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-xs font-medium text-muted-foreground">
                          Comprovante:
                        </span>
                        {cliente.nomes_comprovante.map((nome, idx) => (
                          <Badge key={`${nome}-${idx}`} variant="secondary">
                            {nome}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {cliente.nomes_relatorio.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-medium text-muted-foreground">
                          Relatório:
                        </span>
                        {cliente.nomes_relatorio.map((nome, idx) => (
                          <Badge key={`${nome}-${idx}`} variant="outline">
                            {nome}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openEditForm(cliente)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleAtivo(cliente)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {cliente.ativo ? "Desativar" : "Ativar"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
