"use client";

import React, { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface ConfirmModalProps {
  open: boolean;
  onClose?: () => void;
  title: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  confirmLabel?: string;
  onConfirm?: () => void;
  confirmVariant?: "default" | "destructive" | "outline" | "secondary";
  cancelLabel?: string;
  onCancel?: () => void;
  loading?: boolean;
  className?: string;
}

export function ConfirmModal({
  open,
  onClose,
  title,
  description,
  icon,
  children,
  confirmLabel = "Confirmar",
  onConfirm,
  confirmVariant = "default",
  cancelLabel,
  onCancel,
  loading = false,
  className,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && onClose && !loading) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, loading]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="fixed inset-0 bg-foreground/40 backdrop-blur-xs transition-opacity"
        onClick={() => {
          if (onClose && !loading) onClose();
        }}
        aria-hidden="true"
      />

      <Card
        className={cn(
          "relative z-10 w-full max-w-md shadow-xl",
          className
        )}
      >
        <CardHeader className="relative pb-3">
          {onClose && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              disabled={loading}
              aria-label="Fechar modal"
              className="absolute right-4 top-4 h-8 w-8 text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          )}

          {icon && <div className="mb-2">{icon}</div>}
          <CardTitle className="pr-8 text-lg">{title}</CardTitle>
          {description && (
            <CardDescription className="pt-1">{description}</CardDescription>
          )}
        </CardHeader>

        {children && <CardContent className="pb-4">{children}</CardContent>}

        {(onConfirm || onCancel) && (
          <CardFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {cancelLabel && onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={loading}
                className="w-full sm:w-auto"
              >
                {cancelLabel}
              </Button>
            )}
            {onConfirm && (
              <Button
                type="button"
                variant={confirmVariant}
                onClick={onConfirm}
                disabled={loading}
                className="w-full sm:w-auto"
              >
                {confirmLabel}
              </Button>
            )}
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
