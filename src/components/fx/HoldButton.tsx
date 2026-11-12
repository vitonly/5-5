"use client";

import { useEffect, useRef, useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { StatusLabels, useActionStatus } from "@/components/fx/ActionButton";
import { Burst } from "@/components/fx/Burst";
import { cn } from "@/lib/utils";

/** Сколько держать кнопку, чтобы подтвердить */
const HOLD_MS = 1200;

/**
 * «Удерживай, чтобы подтвердить» — вместо окна «Вы уверены?» для необратимых действий.
 * Кнопка заполняется цветом; отпустил раньше — ничего не происходит, только подсказка.
 * С клавиатуры — удерживать Enter или пробел.
 * onConfirm возвращает true, если всё получилось — тогда на кнопке появится галочка.
 */
export function HoldButton({
  onConfirm,
  children,
  holdText = "Держи…",
  loadingText,
  successText,
  hint,
  celebrate,
  className,
  disabled,
  ...props
}: Omit<ButtonProps, "onClick"> & {
  onConfirm: () => Promise<boolean>;
  /** Надпись, пока кнопку держат */
  holdText?: React.ReactNode;
  loadingText?: React.ReactNode;
  successText?: React.ReactNode;
  /** Подсказка под кнопкой: что произойдёт */
  hint?: React.ReactNode;
  celebrate?: boolean;
}) {
  const { status, run } = useActionStatus();
  const [holding, setHolding] = useState(false);
  const [nudge, setNudge] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
    },
    []
  );

  function start() {
    if (disabled || status !== "idle" || timer.current) return;
    setHolding(true);
    setNudge(false);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      void run(onConfirm);
    }, HOLD_MS);
  }

  function stop() {
    if (!timer.current) return;
    // Отпустили раньше времени — отменяем и подсказываем, что надо держать
    clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
    setNudge(true);
    if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
    nudgeTimer.current = setTimeout(() => setNudge(false), 1800);
  }

  const shown = status === "idle" && holding ? "holding" : status;

  return (
    <span className="inline-flex flex-col items-stretch gap-1">
      {/* Обёртка relative — чтобы салют не обрезался краем кнопки */}
      <span className="relative inline-flex flex-col">
      <Button
        {...props}
        type="button"
        disabled={disabled}
        data-holding={holding || undefined}
        aria-busy={status === "loading"}
        className={cn("hold-btn relative overflow-hidden", status !== "idle" && "pointer-events-none", className)}
        onPointerDown={(e) => {
          if (e.button === 0) start();
        }}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
            e.preventDefault();
            start();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === "Enter" || e.key === " ") stop();
        }}
      >
        {/* Заливка, которая растёт, пока держишь */}
        <span className="hold-fill" aria-hidden style={{ transitionDuration: holding ? `${HOLD_MS}ms` : undefined }} />
        <span className="relative">
          <StatusLabels status={shown} loadingText={loadingText} successText={successText} holdText={holdText}>
            {children}
          </StatusLabels>
        </span>
      </Button>
      {status === "success" && celebrate && <Burst />}
      </span>
      <span className={cn("text-center text-[12px]", nudge ? "text-[var(--warning-ink)]" : "text-[var(--text-3)]")} aria-live="polite">
        {nudge ? "Держи кнопку, пока она не заполнится" : hint}
      </span>
    </span>
  );
}
