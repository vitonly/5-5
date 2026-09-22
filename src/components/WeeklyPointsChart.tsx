import { formatPoints } from "@/lib/points";
import type { PointLog } from "@prisma/client";

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function weekLabel(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}`;
}

export function WeeklyPointsChart({ logs, weeks = 8 }: { logs: PointLog[]; weeks?: number }) {
  const now = new Date();
  const buckets: { start: Date; total: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = startOfWeek(new Date(now));
    start.setDate(start.getDate() - i * 7);
    buckets.push({ start, total: 0 });
  }

  for (const log of logs) {
    const s = startOfWeek(new Date(log.createdAt));
    const bucket = buckets.find((b) => b.start.getTime() === s.getTime());
    if (bucket) bucket.total += log.delta;
  }

  const maxAbs = Math.max(1, ...buckets.map((b) => Math.abs(b.total)));

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5">
      <p className="font-mono-num text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-4)]">
        Очки по неделям
      </p>
      <div className="mt-4 flex h-36 items-end gap-2">
        {buckets.map((b) => {
          const h = Math.max(4, (Math.abs(b.total) / maxAbs) * 100);
          const positive = b.total >= 0;
          return (
            <div key={b.start.toISOString()} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="font-mono-num text-[10px] text-[var(--text-4)]">
                {b.total === 0 ? "—" : formatPoints(b.total)}
              </span>
              <div className="flex h-24 w-full items-end justify-center">
                <div
                  className={`w-full max-w-[28px] rounded-t-[4px] ${
                    positive ? "bg-[var(--points)]" : "bg-[var(--danger)]"
                  }`}
                  style={{ height: `${h}%` }}
                  title={`${weekLabel(b.start)}: ${formatPoints(b.total)}`}
                />
              </div>
              <span className="font-mono-num text-[10px] text-[var(--text-3)]">{weekLabel(b.start)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MetricTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="font-mono-num text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-4)]">
        {label}
      </p>
      <p className="mt-2 font-mono-num text-2xl font-bold text-[var(--text)]">{value}</p>
      {hint && <p className="mt-1 text-[12px] text-[var(--text-3)]">{hint}</p>}
    </div>
  );
}
