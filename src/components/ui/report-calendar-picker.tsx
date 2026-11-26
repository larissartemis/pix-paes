"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function formatIsoDateBr(dateIso: string | null): string {
  if (!dateIso) return "Selecionar data";
  const parts = dateIso.split("-");
  if (parts.length !== 3) return dateIso;
  const [yyyy, mm, dd] = parts;
  return `${dd}/${mm}/${yyyy}`;
}

function parseIsoYearMonth(dateIso: string | null): {
  year: number;
  month: number;
} {
  if (dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    const [y, m] = dateIso.split("-").map(Number);
    return { year: y, month: m - 1 };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

export interface ReportCalendarPickerProps {
  value: string;
  highlightedDates: string[];
  onChange: (dateIso: string) => void;
  className?: string;
}

export function ReportCalendarPicker({
  value,
  highlightedDates,
  onChange,
  className,
}: ReportCalendarPickerProps) {
  const [open, setOpen] = useState(false);
  const [{ year, month }, setViewMonth] = useState(() =>
    parseIsoYearMonth(value)
  );
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Sync calendar month when external value changes
  useEffect(() => {
    if (value) {
      setViewMonth(parseIsoYearMonth(value));
    }
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const highlightedSet = useMemo(
    () => new Set(highlightedDates),
    [highlightedDates]
  );

  const daysGrid = useMemo(() => {
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: Array<{ day: number; dateIso: string } | null> = [];
    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push(null);
    }

    const yyyy = String(year);
    const mm = String(month + 1).padStart(2, "0");

    for (let d = 1; d <= daysInMonth; d++) {
      const dd = String(d).padStart(2, "0");
      cells.push({
        day: d,
        dateIso: `${yyyy}-${mm}-${dd}`,
      });
    }

    return cells;
  }, [year, month]);

  const handleShiftMonth = (delta: number) => {
    const next = new Date(year, month + delta, 1);
    setViewMonth({ year: next.getFullYear(), month: next.getMonth() });
  };

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Selecionar data do relatório"
        aria-expanded={open}
        className={cn(
          "inline-flex h-9 cursor-pointer items-center justify-between gap-2.5 rounded-xl border border-input bg-card px-3.5 text-xs font-semibold text-foreground shadow-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          open && "border-primary/60 ring-2 ring-ring/20",
          className
        )}
      >
        <span className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <span>{formatIsoDateBr(value)}</span>
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
            open && "rotate-180 text-primary"
          )}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1.5 w-72 rounded-2xl border border-border bg-popover p-3.5 text-popover-foreground shadow-xl">
          {/* Month / Year Header */}
          <div className="mb-3 flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => handleShiftMonth(-1)}
              className="h-7 w-7 rounded-lg"
              aria-label="Mês anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <span className="text-xs font-bold uppercase tracking-wide text-foreground">
              {MONTH_NAMES[month]} {year}
            </span>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => handleShiftMonth(1)}
              className="h-7 w-7 rounded-lg"
              aria-label="Próximo mês"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Weekday Headers */}
          <div className="mb-1.5 grid grid-cols-7 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {WEEKDAY_SHORT.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>

          {/* Calendar Days Grid */}
          <div className="grid grid-cols-7 gap-1">
            {daysGrid.map((cell, idx) => {
              if (!cell) {
                return <div key={`empty-${idx}`} className="h-8" />;
              }

              const isSelected = cell.dateIso === value;
              const hasReport = highlightedSet.has(cell.dateIso);

              return (
                <button
                  key={cell.dateIso}
                  type="button"
                  onClick={() => {
                    onChange(cell.dateIso);
                    setOpen(false);
                  }}
                  title={
                    hasReport
                      ? `Relatório disponível em ${formatIsoDateBr(cell.dateIso)}`
                      : formatIsoDateBr(cell.dateIso)
                  }
                  className={cn(
                    "relative flex h-8 w-full cursor-pointer items-center justify-center rounded-lg text-xs transition-colors",
                    isSelected
                      ? "bg-primary font-bold text-primary-foreground shadow-xs"
                      : hasReport
                      ? "border border-primary/30 bg-primary/15 font-bold text-primary hover:bg-primary/25"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <span>{cell.day}</span>
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded border border-primary/30 bg-primary/15" />
              <span>Dia com relatório</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded bg-primary" />
              <span>Selecionado</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
