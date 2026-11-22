"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import {
  CheckSquare,
  FileSpreadsheet,
  Home,
  Loader2,
  LogOut,
  Menu,
  ScanText,
  Users,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { authService } from "@/services/auth.service";

interface AuthGateProps {
  children: React.ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  badge?: string;
}

export function AuthGate({ children }: AuthGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

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

  const userMetadata = session.user.user_metadata as
    | { full_name?: string; name?: string; display_name?: string }
    | undefined;

  const userDisplayName =
    userMetadata?.full_name ||
    userMetadata?.name ||
    userMetadata?.display_name ||
    (session.user.email ? session.user.email.split("@")[0] : "Usuário");

  const sidebarItems: NavItem[] = [
    { href: "/", label: "Início", icon: Home },
    { href: "/clientes", label: "Clientes", icon: Users },
    { href: "/relatorios", label: "Relatórios", icon: FileSpreadsheet },
    {
      href: "/conferencia",
      label: "Conferência",
      icon: CheckSquare,
      disabled: true,
      badge: "Em breve",
    },
    { href: "/leitor", label: "Leitor", icon: ScanText },
  ];

  const bottomSideItems = {
    left: [
      { href: "/", label: "Início", icon: Home, disabled: false },
      { href: "/clientes", label: "Clientes", icon: Users, disabled: false },
    ],
    right: [
      {
        href: "/relatorios",
        label: "Relatórios",
        icon: FileSpreadsheet,
        disabled: false,
      },
      {
        href: "/conferencia",
        label: "Conferência",
        icon: CheckSquare,
        disabled: true,
      },
    ],
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top Bar: Left Hamburger, Center "Pix Pães", Right User Name + Sair */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto grid h-14 max-w-5xl grid-cols-3 items-center px-3 sm:px-4">
          {/* Left: Hamburger Button */}
          <div className="flex items-center justify-start">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menu"
              className="text-foreground"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>

          {/* Center: Pix Pães */}
          <div className="flex items-center justify-center">
            <Link
              href="/"
              className="text-base font-bold tracking-tight text-primary sm:text-lg"
            >
              Pix Pães
            </Link>
          </div>

          {/* Right: User Name + Sair */}
          <div className="flex items-center justify-end gap-1.5 sm:gap-2.5">
            <span
              className="max-w-24 truncate text-xs font-medium text-foreground sm:max-w-44"
              title={session.user.email || userDisplayName}
            >
              {userDisplayName}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground sm:px-3"
              title="Sair da conta"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden xs:inline sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Sidebar Drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-foreground/40 backdrop-blur-xs transition-opacity"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Content */}
          <aside className="relative z-10 flex w-72 max-w-[82vw] flex-col border-r border-border bg-card shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <span className="text-base font-bold tracking-tight text-primary">
                Pix Pães
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(false)}
                aria-label="Fechar menu"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <nav className="flex-1 space-y-1 p-3">
              {sidebarItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;

                if (item.disabled) {
                  return (
                    <div
                      key={item.href}
                      className="flex cursor-not-allowed items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground/60"
                    >
                      <span className="flex items-center gap-3">
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </span>
                      {item.badge && (
                        <Badge variant="secondary" className="text-[10px]">
                          {item.badge}
                        </Badge>
                      )}
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      "flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-foreground hover:bg-accent"
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-border p-4">
              <div className="mb-3 min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {userDisplayName}
                </p>
                {session.user.email && (
                  <p className="truncate text-xs text-muted-foreground">
                    {session.user.email}
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSignOut}
                className="w-full justify-center"
              >
                <LogOut className="h-4 w-4" />
                Sair da conta
              </Button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content with bottom padding for the mobile bottom bar */}
      <main className="flex-1 pb-24">{children}</main>

      {/* Smartphone Bottom Navigation Bar with Central "Leitor de Comprovantes" Button */}
      <nav
        aria-label="Navegação inferior"
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-card/95 backdrop-blur"
      >
        <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center px-2">
          {/* Left 2 items */}
          {bottomSideItems.left.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;

            if (item.disabled) {
              return (
                <div
                  key={item.href}
                  className="flex flex-col items-center justify-center gap-1 py-1 text-muted-foreground/45"
                  title={`${item.label} (Em desenvolvimento)`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </div>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-1 transition-colors",
                  active
                    ? "text-primary font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}

          {/* Center Floating Action Button: Leitor de Comprovantes */}
          <div className="flex items-center justify-center">
            <Link
              href="/leitor"
              aria-label="Leitor de Comprovantes"
              className="group -mt-6 flex flex-col items-center justify-center"
            >
              <div
                className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-full border-4 border-background bg-primary text-primary-foreground shadow-lg transition-transform group-active:scale-95",
                  pathname === "/leitor" && "ring-2 ring-ring"
                )}
              >
                <ScanText className="h-6 w-6" />
              </div>
              <span
                className={cn(
                  "mt-0.5 text-[10px] font-semibold",
                  pathname === "/leitor"
                    ? "text-primary"
                    : "text-muted-foreground"
                )}
              >
                Leitor
              </span>
            </Link>
          </div>

          {/* Right 2 items */}
          {bottomSideItems.right.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;

            if (item.disabled) {
              return (
                <div
                  key={item.href}
                  className="flex flex-col items-center justify-center gap-1 py-1 text-muted-foreground/45"
                  title={`${item.label} (Em desenvolvimento)`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </div>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-1 transition-colors",
                  active
                    ? "text-primary font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
