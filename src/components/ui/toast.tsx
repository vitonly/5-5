"use client";

import { useEffect, useSyncExternalStore } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* Лёгкие всплывающие уведомления без зависимостей.
   Использование: import { toast } from "@/components/ui/toast"; toast.success("Сохранено") */

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: number; kind: ToastKind; message: string; leaving?: boolean };

let items: ToastItem[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const EMPTY: ToastItem[] = [];

function emit() {
  for (const l of listeners) l();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function dismiss(id: number) {
  items = items.map((t) => (t.id === id ? { ...t, leaving: true } : t));
  emit();
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, 200);
}

function push(kind: ToastKind, message: string, duration = kind === "error" ? 5000 : 3000) {
  const id = ++seq;
  items = [...items.slice(-2), { id, kind, message }];
  emit();
  setTimeout(() => dismiss(id), duration);
  return id;
}

export const toast = Object.assign((message: string) => push("info", message), {
  success: (message: string) => push("success", message),
  error: (message: string) => push("error", message),
  info: (message: string) => push("info", message),
  dismiss,
});

const ICON = { success: CheckCircle2, error: AlertCircle, info: Info };
const ICON_COLOR = {
  success: "text-[var(--success)]",
  error: "text-[var(--danger)]",
  info: "text-[var(--points)]",
};

export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => items, () => EMPTY);

  // Escape закрывает последнее уведомление
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && items.length) dismiss(items[items.length - 1].id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] z-[100] flex flex-col items-center gap-2 px-4 min-[720px]:inset-x-auto min-[720px]:bottom-6 min-[720px]:right-6 min-[720px]:items-end"
    >
      {list.map((t) => {
        const Icon = ICON[t.kind];
        return (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            data-leaving={t.leaving ? "true" : undefined}
            className="toast-item pointer-events-auto flex w-full max-w-[380px] items-start gap-2.5 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] py-3 pl-3.5 pr-2 text-sm text-[var(--text)] shadow-[var(--shadow-popover)]"
          >
            <Icon className={cn("mt-px h-[18px] w-[18px] shrink-0", ICON_COLOR[t.kind])} aria-hidden />
            <p className="min-w-0 flex-1 whitespace-pre-line leading-snug">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Закрыть"
              className="-my-1 shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--text-3)] transition-colors hover:bg-[var(--control)] hover:text-[var(--text)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
