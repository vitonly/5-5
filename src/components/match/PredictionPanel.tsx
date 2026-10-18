"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { PredictionView, Side } from "@/lib/match-predictions";

/** Прогнозы на победителей игр дня — под составами на странице 5×5 */
export function PredictionPanel({
  sessionId,
  view,
  canVote,
}: {
  sessionId: string;
  view: PredictionView;
  canVote: boolean;
}) {
  const router = useRouter();
  const [picks, setPicks] = useState<Record<number, Side | null>>(
    Object.fromEntries(view.games.map((g) => [g.gameNumber, g.myPick]))
  );
  const [pending, startTransition] = useTransition();
  const voting = view.open && canVote;
  const done = view.games.every((g) => picks[g.gameNumber]);

  async function pick(gameNumber: number, side: Side) {
    if (!voting) return;
    const prev = picks[gameNumber];
    setPicks((p) => ({ ...p, [gameNumber]: side }));
    const res = await fetch("/api/matches/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, gameNumber, pick: side }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setPicks((p) => ({ ...p, [gameNumber]: prev }));
      toast.error(typeof data.error === "string" ? data.error : "Не удалось сохранить прогноз");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <section
      aria-labelledby={`pred-${sessionId}`}
      className="mx-4 mb-5 rounded-[var(--radius-card)] border border-[var(--border-soft)] bg-[var(--surface-muted)] p-4 min-[720px]:mx-6"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id={`pred-${sessionId}`} className="font-display text-[15px] font-semibold">
          Прогноз на матч
        </h3>
        <p className="text-[12px] text-[var(--text-3)]">
          {view.open
            ? canVote
              ? done
                ? "Прогноз сохранён — можно поменять до старта"
                : "Засчитается, только если угадаешь все игры дня"
              : "Голосуют ученики до старта сессии"
            : view.allCorrect === true
              ? "Ты угадал все игры!"
              : view.allCorrect === false
                ? "В этот раз не угадал"
                : "Прогнозы закрыты"}
        </p>
      </div>

      <div className="grid gap-3 min-[720px]:grid-cols-2">
        {view.games.map((g) => {
          const my = picks[g.gameNumber];
          const total = g.counts ? g.counts.RADIANT + g.counts.DIRE : 0;
          return (
            <div key={g.gameNumber}>
              <p className="mb-1.5 text-[12px] font-medium text-[var(--text-2)]">Победитель игры №{g.gameNumber}</p>
              <div className="grid grid-cols-2 gap-2">
                {(["RADIANT", "DIRE"] as Side[]).map((side) => {
                  const selected = my === side;
                  const won = g.winner === side;
                  const lost = g.winner != null && g.winner !== side;
                  const pct = g.counts && total ? Math.round((g.counts[side] / total) * 100) : null;
                  return (
                    <button
                      key={side}
                      type="button"
                      disabled={!voting || pending}
                      onClick={() => pick(g.gameNumber, side)}
                      aria-pressed={selected}
                      className={cn(
                        "press relative flex min-h-[48px] items-center justify-between gap-2 overflow-hidden rounded-[var(--radius-control)] border px-3 py-2 text-left text-[13px] font-semibold transition-colors",
                        selected
                          ? "border-[var(--points)] bg-[var(--points-bg)] text-[var(--points-ink)]"
                          : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)]",
                        voting && !selected && "hover:border-[var(--points-border)]",
                        !voting && "cursor-default",
                        lost && "opacity-60"
                      )}
                    >
                      {pct != null && (
                        <span
                          aria-hidden
                          className="absolute inset-y-0 left-0 bg-[var(--control)]"
                          style={{ width: `${pct}%`, opacity: 0.6 }}
                        />
                      )}
                      {/* Название команды переносится на 2 строки, а не обрезается «Team Влад Кар…» */}
                      <span className="relative min-w-0 line-clamp-2 break-words leading-snug">{g.names[side]}</span>
                      <span className="relative flex shrink-0 items-center gap-1.5">
                        {pct != null && <span className="font-mono-num text-[12px] text-[var(--text-3)]">{pct}%</span>}
                        {won && <Check className="h-4 w-4 text-[var(--success-ink)]" aria-label="Победила" />}
                        {selected && lost && <X className="h-4 w-4 text-[var(--danger)]" aria-label="Не угадал" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {view.open && canVote && (
        <p className="mt-3 text-[12px] text-[var(--text-3)]">Можно проголосовать и в Telegram — бот присылает кнопки.</p>
      )}
      {view.closed && view.dayCorrectTotal > 0 && (
        <div className="mt-3 rounded-[var(--radius-control)] bg-[var(--surface)] px-3 py-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--text-3)]">
            Угадали все игры дня
          </p>
          <p className="mt-0.5 text-[13px] font-medium text-[var(--success-ink)]">
            {view.dayCorrectNames.length
              ? view.dayCorrectNames.join(", ")
              : "Никто не угадал все игры"}
            <span className="ml-1.5 font-normal text-[var(--text-3)]">
              ({view.dayCorrectNames.length}/{view.dayCorrectTotal})
            </span>
          </p>
        </div>
      )}
    </section>
  );
}
