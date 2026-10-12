"use client";

import { cn } from "@/lib/utils";

/** Переключатель вкладок в стиле навигации: серая дорожка, белая активная плашка */
export function Segmented<T extends string>({
  value,
  onChange,
  items,
  className,
  stretch = true,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: React.ReactNode; count?: number }[];
  className?: string;
  /** растянуть на всю ширину на телефоне */
  stretch?: boolean;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "no-scrollbar flex gap-1 overflow-x-auto rounded-[var(--radius-control)] bg-[var(--control)] p-1",
        stretch ? "min-[720px]:inline-flex" : "inline-flex",
        className
      )}
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className={cn(
              "press min-h-[40px] whitespace-nowrap rounded-[var(--radius-sm)] px-3 text-center text-sm font-medium transition-[background-color,color,box-shadow] duration-[200ms]",
              stretch && "flex-1 min-[720px]:flex-none min-[720px]:px-4",
              active
                ? "bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-xs)]"
                : "text-[var(--text-2)] hover:text-[var(--text)]"
            )}
          >
            {it.label}
            {it.count != null && (
              <span
                className={cn(
                  "ml-1.5 font-mono-num text-[12px]",
                  active ? "text-[var(--points-ink)]" : "text-[var(--text-3)]"
                )}
              >
                {it.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Ряд фильтров-чипов: на телефоне листается вбок, на ПК переносится */
export function FilterChips<T extends string>({
  value,
  onChange,
  items,
  label,
}: {
  value: T | null;
  onChange: (v: T | null) => void;
  items: { value: T | null; label: React.ReactNode }[];
  label?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {label && <span className="hidden shrink-0 text-[12px] font-medium text-[var(--text-3)] min-[720px]:inline">{label}</span>}
      <div className="no-scrollbar -mx-4 flex min-w-0 gap-1.5 overflow-x-auto px-4 min-[720px]:mx-0 min-[720px]:flex-wrap min-[720px]:px-0">
        {items.map((it) => {
          const active = it.value === value;
          return (
            <button
              key={it.value ?? "__all"}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(it.value)}
              className={cn(
                "press h-8 shrink-0 whitespace-nowrap rounded-full border px-3 text-[13px] font-medium transition-colors",
                active
                  ? "border-[var(--points-border)] bg-[var(--points-bg)] text-[var(--points-ink)]"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:bg-[var(--control)]"
              )}
            >
              {it.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
