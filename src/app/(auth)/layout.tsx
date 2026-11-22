"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { authService } from "@/services/auth.service";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const isResetPassword = pathname === "/redefinir-senha";

  useEffect(() => {
    let mounted = true;

    authService.getSession().then((session) => {
      if (!mounted) return;
      if (session && !isResetPassword) {
        router.replace("/");
        return;
      }
      setChecking(false);
    });

    const subscription = authService.onAuthStateChange((session) => {
      if (!mounted) return;
      if (session && !isResetPassword) {
        router.replace("/");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router, isResetPassword]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      {children}
    </main>
  );
}
