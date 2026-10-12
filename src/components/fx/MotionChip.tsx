"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { needsPermission, requestMotion, subscribeMotionState } from "@/components/fx/motion";
import { cn } from "@/lib/utils";

/**
 * Кнопка «Оживить карточки» — только на iPhone/iPad, где для гироскопа
 * нужно разрешение. На Android и компьютере не показывается.
 */
export function MotionChip({ className }: { className?: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const update = () => setShow(needsPermission());
    update();
    return subscribeMotionState(update);
  }, []);

  if (!show) return null;

  return (
    <button
      type="button"
      onClick={() => void requestMotion()}
      className={cn(
        "press inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--points-border)] bg-[var(--points-bg)] px-3 text-[12px] font-medium text-[var(--points-ink)]",
        className
      )}
    >
      <Sparkles className="h-3.5 w-3.5" aria-hidden />
      Оживить карточки
    </button>
  );
}
