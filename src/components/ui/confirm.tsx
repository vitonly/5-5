"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { AlertTriangle, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* Своё окно подтверждения вместо системного confirm().
   Использование: if (!(await confirmAction("Удалить материал?"))) return; */

type ConfirmOptions = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** красная кнопка — для необратимых действий */
  danger?: boolean;
};

type Pending = ConfirmOptions & { message: string; resolve: (ok: boolean) => void };

let current: Pending | null = null;
const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const DANGER_WORDS = /удал|сброс|обнул|отмен|убрать|закрыть сезон|нельзя отменить/i;

export function confirmAction(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  current?.resolve(false);
  return new Promise((resolve) => {
    current = { danger: DANGER_WORDS.test(message), ...options, message, resolve };
    emit();
  });
}

function close(ok: boolean) {
  const c = current;
  current = null;
  emit();
  c?.resolve(ok);
}

export function ConfirmHost() {
  const pending = useSyncExternalStore(subscribe, () => current, () => null);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pending) return;
    okRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending]);

  if (!pending) return null;

  // Заголовок — первая строка или первое предложение, остальное — пояснение
  const msg = pending.message.trim();
  const nl = msg.indexOf("\n");
  const sentence = msg.match(/^[^?!.]*[?!.](?=\s)/);
  const cut = Math.min(nl > 0 ? nl : msg.length, sentence ? sentence[0].length : msg.length);
  const title = pending.title ?? msg.slice(0, cut).trim();
  const body = pending.title ? msg : msg.slice(cut).trim();
  const Icon = pending.danger ? AlertTriangle : HelpCircle;

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center p-4 min-[560px]:items-center" role="presentation">
      <div className="confirm-backdrop absolute inset-0 bg-[rgba(15,26,25,0.45)]" onClick={() => close(false)} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="confirm-panel relative w-full max-w-[420px] rounded-[var(--radius-frame)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-popover)]"
      >
        <div className="flex gap-3">
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
              pending.danger ? "bg-[var(--danger-bg)] text-[var(--danger)]" : "bg-[var(--admin-bg)] text-[var(--admin)]"
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 pt-1">
            <p id="confirm-title" className="text-[15px] font-semibold leading-snug text-[var(--text)]">
              {title}
            </p>
            {body && <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--text-2)]">{body}</p>}
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 min-[400px]:flex-row min-[400px]:justify-end">
          <Button variant="outline" onClick={() => close(false)}>
            {pending.cancelLabel ?? "Отмена"}
          </Button>
          <Button
            ref={okRef}
            variant={pending.danger ? "destructive" : "admin"}
            className={pending.danger ? "border-transparent bg-[var(--danger)] text-white hover:bg-[var(--danger)] hover:opacity-90" : undefined}
            onClick={() => close(true)}
          >
            {pending.confirmLabel ?? (pending.danger ? "Да, выполнить" : "Подтвердить")}
          </Button>
        </div>
      </div>
    </div>
  );
}
