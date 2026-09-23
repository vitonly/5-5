import { PointsPill } from "@/components/StatPills";
import {
  categorizePointReason,
  formatPoints,
  POINT_CATEGORY_LABELS,
  type PointCategory,
} from "@/lib/points";
import type { PointLog } from "@prisma/client";

const ORDER: PointCategory[] = ["homework", "match", "bonus", "penalty", "other"];

export function SchoolPointsTile({
  totalPoints,
  logs,
}: {
  totalPoints: number;
  logs: PointLog[];
}) {
  const sums: Record<PointCategory, number> = {
    homework: 0,
    match: 0,
    bonus: 0,
    penalty: 0,
    other: 0,
  };
  for (const log of logs) {
    sums[categorizePointReason(log.reason)] += log.delta;
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--points-border)] bg-[var(--points-bg)] p-5">
      <p className="font-mono-num text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--points)]">
        Очки платформы
      </p>
      <div className="mt-3">
        <PointsPill value={totalPoints} />
      </div>
      <ul className="mt-4 space-y-2">
        {ORDER.map((key) => {
          if (sums[key] === 0) return null;
          return (
            <li key={key} className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-2)]">{POINT_CATEGORY_LABELS[key]}</span>
              <span
                className={`font-mono-num font-bold ${
                  sums[key] > 0 ? "text-[var(--success)]" : "text-[var(--danger)]"
                }`}
              >
                {sums[key] > 0 ? "+" : ""}
                {formatPoints(sums[key])}
              </span>
            </li>
          );
        })}
      </ul>
      {logs.length === 0 && (
        <p className="mt-3 text-sm text-[var(--text-3)]">Пока нет начислений</p>
      )}
    </div>
  );
}
