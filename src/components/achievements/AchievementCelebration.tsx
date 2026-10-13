"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AchievementBadge, TIER_NAMES } from "@/components/achievements/AchievementBadge";
import { fireConfetti } from "@/lib/confetti";
import { formatPoints } from "@/lib/points";
import type { UnlockedAchievement } from "@/lib/achievements";

/** Окно «Новая ачивка!» с конфетти — показывается один раз после открытия */
export function AchievementCelebration({ items }: { items: UnlockedAchievement[] }) {
  const [open, setOpen] = useState(items.length > 0);

  useEffect(() => {
    if (items.length === 0) return;
    const t = setTimeout(() => fireConfetti(), 250);
    return () => clearTimeout(t);
  }, [items.length]);

  if (!open || items.length === 0) return null;

  const total = items.reduce((s, i) => s + i.points, 0);
  const shown = items.slice(-4);

  function close() {
    setOpen(false);
    void fetch("/api/achievements/seen", { method: "POST" }).catch(() => {});
  }

  return (
    <div className="fixed inset-0 z-[115] flex items-end justify-center p-4 min-[560px]:items-center" role="presentation">
      <div className="confirm-backdrop absolute inset-0 bg-[rgba(15,26,25,0.5)]" onClick={close} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ach-title"
        className="confirm-panel relative w-full max-w-[400px] overflow-hidden rounded-[var(--radius-frame)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-popover)]"
      >
        <div
          className="px-5 pb-4 pt-6 text-center"
          style={{ background: "radial-gradient(120% 90% at 50% 0%, var(--gold-light) 0%, transparent 60%)" }}
        >
          <p className="eyebrow" style={{ color: "var(--gold-ink)" }}>
            {items.length > 1 ? `Новые ачивки · ${items.length}` : "Новая ачивка"}
          </p>
          <h2 id="ach-title" className="mt-1 font-display text-[22px] font-bold">
            {items.length > 1 ? "Ты в ударе!" : items[0].title}
          </h2>
        </div>
        <ul className="space-y-2 px-5">
          {shown.map((a) => (
            <li key={a.id} className="flex items-center gap-3 rounded-[var(--radius-control)] bg-[var(--surface-muted)] px-3 py-2.5">
              <AchievementBadge icon={a.icon} tier={a.tier} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold">{a.title}</p>
                <p className="line-clamp-2 text-[12px] leading-snug text-[var(--text-3)]">
                  {TIER_NAMES[a.tier]} · {a.description}
                </p>
              </div>
              {a.points > 0 && (
                <span className="shrink-0 rounded-full bg-[var(--points-bg)] px-2 py-0.5 font-mono-num text-[12px] font-bold text-[var(--points-ink)]">
                  +{formatPoints(a.points)}
                </span>
              )}
            </li>
          ))}
        </ul>
        {items.length > shown.length && (
          <p className="mt-2 px-5 text-center text-[12px] text-[var(--text-3)]">и ещё {items.length - shown.length}</p>
        )}
        <div className="flex flex-col gap-2 p-5 min-[400px]:flex-row-reverse">
          <Button onClick={close} className="flex-1">
            {total > 0 ? `Круто! +${formatPoints(total)} очк.` : "Круто!"}
          </Button>
          <Button asChild variant="outline" className="flex-1" onClick={close}>
            <a href="/profile?tab=achievements">Все ачивки</a>
          </Button>
        </div>
      </div>
    </div>
  );
}
