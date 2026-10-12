"use client";

import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Карточка, которая сворачивается: формы «Добавить…» и архивные записи не занимают экран */
export function CollapsibleCard({
  title,
  description,
  summary,
  defaultOpen = false,
  variant = "section",
  headerExtra,
  className,
  open: openProp,
  onOpenChange,
  children,
}: {
  /** управляемый режим (например, форма раскрывается при «Править») */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** короткая строка справа в свернутом виде (счёт, количество) */
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  /** "create" — кнопка с плюсом для форм добавления */
  variant?: "section" | "create";
  /** кнопки в шапке, которые видны всегда (не сворачивают карточку) */
  headerExtra?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const [openState, setOpenState] = useState(defaultOpen);
  const open = openProp ?? openState;
  const setOpen = (fn: (v: boolean) => boolean) => {
    const next = fn(open);
    setOpenState(next);
    onOpenChange?.(next);
  };
  const create = variant === "create";

  return (
    <section className={cn("surface-card overflow-hidden", className)}>
      <div className="flex items-center gap-2 pr-3 min-[720px]:pr-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 text-left min-[720px]:px-5 min-[720px]:py-4"
        >
          {create && (
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--admin-bg)] text-[var(--admin)] transition-transform duration-200",
                open && "rotate-45"
              )}
            >
              <Plus className="h-4 w-4" aria-hidden />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold leading-snug text-[var(--text)] min-[720px]:text-[16px]">
              {title}
            </span>
            {description && (
              <span className="mt-0.5 block text-[13px] leading-snug text-[var(--text-3)]">{description}</span>
            )}
          </span>
          {summary && !open && <span className="hidden shrink-0 text-[13px] text-[var(--text-2)] min-[560px]:block">{summary}</span>}
          {!create && (
            <ChevronDown
              aria-hidden
              className={cn("h-5 w-5 shrink-0 text-[var(--text-3)] transition-transform duration-200", open && "rotate-180")}
            />
          )}
        </button>
        {headerExtra && <div className="flex shrink-0 items-center gap-2">{headerExtra}</div>}
      </div>
      {open && (
        <div className="border-t border-[var(--border-soft)] px-4 pb-4 pt-4 min-[720px]:px-5 min-[720px]:pb-5">{children}</div>
      )}
    </section>
  );
}
