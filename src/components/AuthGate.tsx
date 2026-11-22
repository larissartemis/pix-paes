"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { FileSpreadsheet, Home, Loader2, LogOut, ScanText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { authService } from "@/services/auth.service";

interface AuthGateProps {
  children: React.ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;

    authService.getSession().then((currentSession) => {
      if (!mounted) return;
      if (!currentSession) {
        router.replace("/login");
        return;
      }
      setSession(currentSession);
      setChecking(false);
    });

    const subscription = authService.onAuthStateChange((nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      if (!nextSession) {
        router.replace("/login");
      } else {
        setChecking(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  async function handleSignOut() {
    await authService.signOut();
    router.replace("/login");
  }

  if (checking || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium">Verificando sessão...</p>
        </div>
      </div>
    );
  }

  const navItems = [
    { href: "/", label: "Início", icon: Home },
    { href: "/leitor", label: "Leitor", icon: ScanText },
    { href: "/relatorios", label: "Relatórios", icon: FileSpreadsheet },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm font-bold tracking-tight text-primary"
            >
              Pix Pães
            </Link>
            <nav className="flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden max-w-44 truncate text-xs text-muted-foreground sm:inline">
              {session.user.email}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
