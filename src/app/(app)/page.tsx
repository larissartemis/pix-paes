"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, FileSpreadsheet, ScanText, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function HomePage() {
  const router = useRouter();

  // Preserve PWA Web Share Target redirect (`/?shared=1` or `/?shared_error=1`)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("shared") || params.has("shared_error")) {
      router.replace(`/leitor${window.location.search}`);
    }
  }, [router]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Painel Pix Pães
        </h1>
        <p className="text-sm text-muted-foreground">
          Controle de comprovantes Pix, clientes e conferência de relatórios.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="flex flex-col justify-between border-primary/20">
          <CardHeader>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ScanText className="h-5 w-5" />
              </div>
              <Badge variant="success">Ativo</Badge>
            </div>
            <CardTitle>Leitor de Comprovantes</CardTitle>
            <CardDescription>
              Leia comprovantes por imagem, PDF, texto ou link compartilhado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/leitor" className="block">
              <Button className="w-full">
                Abrir leitor
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="flex flex-col justify-between opacity-85">
          <CardHeader>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                <Users className="h-5 w-5" />
              </div>
              <Badge variant="secondary">Em breve</Badge>
            </div>
            <CardTitle>Clientes</CardTitle>
            <CardDescription>
              Cadastre lojas, rotas e os nomes que aparecem nos comprovantes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" disabled className="w-full">
              Em desenvolvimento
            </Button>
          </CardContent>
        </Card>

        <Card className="flex flex-col justify-between opacity-85 sm:col-span-2 lg:col-span-1">
          <CardHeader>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <Badge variant="secondary">Em breve</Badge>
            </div>
            <CardTitle>Relatórios &amp; Conferência</CardTitle>
            <CardDescription>
              Compare os comprovantes enviados com os valores recebidos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" disabled className="w-full">
              Em desenvolvimento
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
