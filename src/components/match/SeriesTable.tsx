import { cn } from "@/lib/utils";
import type { SeriesRow } from "@/lib/match-series";

// 2 → «2», 2.25 → «2.3» (как в lib/points.ts; тот файл работает с базой, в браузер его не берём)
function formatPoints(v: number) {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/**
 * Таблица мини-сезона («Игры по сертификатам»): место, игрок, игры, победы, MVP, очки.
 * Подходит и для страницы 5v5, и для панели тренера.
 */
export function SeriesTable({ rows, viewerId }: { rows: SeriesRow[]; viewerId?: string }) {
  if (!rows.length) {
    return <p className="text-sm text-[var(--text-3)]">Пока нет участников.</p>;
  }
  // Колонки: место, имя, игры, победы, MVP, очки
  const grid = "grid grid-cols-[28px_minmax(0,1fr)_40px_40px_40px_56px] items-center gap-2";
  return (
    <div className="surface-card overflow-hidden">
      <div className={cn(grid, "border-b border-[var(--border-soft)] px-3 py-2")}>
        <span className="eyebrow text-[var(--text-3)]">#</span>
        <span className="eyebrow text-[var(--text-3)]">Игрок</span>
        <span className="eyebrow text-center text-[var(--text-3)]" title="Сыграно игр">Игр</span>
        <span className="eyebrow text-center text-[var(--text-3)]" title="Победы">Поб.</span>
        <span className="eyebrow text-center text-[var(--text-3)]">MVP</span>
        <span className="eyebrow text-right text-[var(--text-3)]">Очки</span>
      </div>
      <ol className="divide-y divide-[var(--border-soft)]">
        {rows.map((r, i) => (
          <li
            key={r.userId}
            className={cn(grid, "px-3 py-2.5", r.userId === viewerId && "bg-[var(--points-bg)]")}
          >
            <span className="font-mono-num text-[14px] font-bold text-[var(--text-3)]">{i + 1}</span>
            <span className="truncate text-[14px] font-medium">{r.name}</span>
            <span className="text-center font-mono-num text-[14px] text-[var(--text-2)]">{r.games}</span>
            <span className="text-center font-mono-num text-[14px] text-[var(--text-2)]">{r.wins}</span>
            <span className="text-center font-mono-num text-[14px] text-[var(--text-2)]">{r.mvp || "·"}</span>
            <span className="text-right font-mono-num text-[16px] font-bold text-[var(--points-ink)]">
              {formatPoints(r.points)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
