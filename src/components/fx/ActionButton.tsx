"use client";

import { useCallback, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Burst } from "@/components/fx/Burst";
import { cn } from "@/lib/utils";

export type ActionStatus = "idle" | "loading" | "success";

/** Сколько держим галочку, прежде чем обновить страницу или перейти дальше */
const SUCCESS_PAUSE = 900;

/**
 * Состояние кнопки-действия: run(fn) → «загрузка», потом «галочка» (или назад, если не вышло).
 * run возвращает true, когда галочку уже показали — после этого можно обновлять страницу.
 */
export function useActionStatus() {
  const [status, setStatus] = useState<ActionStatus>("idle");
  const busy = useRef(false);

  const run = useCallback(async (fn: () => Promise<boolean>) => {
    if (busy.current) return false; // защита от двойного нажатия
    busy.current = true;
    setStatus("loading");
    const ok = await fn().catch(() => false);
    if (!ok) {
      busy.current = false;
      setStatus("idle");
      return false;
    }
    setStatus("success");
    await new Promise((r) => setTimeout(r, SUCCESS_PAUSE));
    // Через секунду кнопка снова обычная (если ещё на экране)
    setTimeout(() => {
      busy.current = false;
      setStatus("idle");
    }, 1500);
    return true;
  }, []);

  return { status, run };
}

/** Три надписи лежат друг на друге, видна одна — так кнопка не меняет ширину */
export function StatusLabels({
  status,
  children,
  loadingText,
  successText,
  holdText,
}: {
  status: ActionStatus | "holding";
  children: React.ReactNode;
  loadingText?: React.ReactNode;
  successText?: React.ReactNode;
  /** Надпись, пока кнопку удерживают (HoldButton) */
  holdText?: React.ReactNode;
}) {
  return (
    <span className="status-labels">
      <span data-on={status === "idle" || (status === "holding" && !holdText)}>{children}</span>
      {holdText && <span data-on={status === "holding"}>{holdText}</span>}
      <span data-on={status === "loading"}>
        <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
        {loadingText ?? children}
      </span>
      <span data-on={status === "success"}>
        <Check className="status-check" aria-hidden />
        {successText ?? "Готово"}
      </span>
    </span>
  );
}

/**
 * Кнопка, которая сама показывает «загрузка → галочка».
 * Пока идёт загрузка или видна галочка — нажатия не принимает (но и не сереет).
 * celebrate — салют на успехе (голос за MVP, сданная домашка).
 */
export function ActionButton({
  status,
  loadingText,
  successText,
  celebrate,
  className,
  onClick,
  children,
  ...props
}: ButtonProps & {
  status: ActionStatus;
  loadingText?: React.ReactNode;
  successText?: React.ReactNode;
  celebrate?: boolean;
}) {
  const locked = status !== "idle";
  return (
    <Button
      {...props}
      className={cn("relative", locked && "pointer-events-none", className)}
      aria-busy={status === "loading"}
      aria-disabled={locked || props.disabled}
      onClick={(e) => {
        if (locked) return;
        onClick?.(e);
      }}
    >
      <StatusLabels status={status} loadingText={loadingText} successText={successText}>
        {children}
      </StatusLabels>
      {status === "success" && celebrate && <Burst />}
    </Button>
  );
}
