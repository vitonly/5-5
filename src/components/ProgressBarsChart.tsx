"use client";

type Point = { label: string; games: number; replays: number };

export function ProgressBarsChart({
  points,
  title = "Игры и реплеи",
}: {
  points: Point[];
  title?: string;
}) {
  if (!points.length) {
    return (
      <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5 text-sm text-[var(--text-3)]">
        Пока нет данных за выбранный период.
      </div>
    );
  }

  const max = Math.max(1, ...points.map((p) => Math.max(p.games, p.replays)));

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5">
      <p className="font-mono-num text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-4)]">
        {title}
      </p>
      <div className="mt-2 flex gap-4 text-[11px] text-[var(--text-3)]">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[var(--points)]" /> игры
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[var(--admin)]" /> реплеи
        </span>
      </div>
      <div className="mt-4 flex h-40 items-end gap-1.5 overflow-x-auto">
        {points.map((p) => (
          <div
            key={p.label}
            className="flex min-w-[28px] flex-1 flex-col items-center gap-1"
            title={`${p.label}: игр ${p.games}, реплеев ${p.replays}`}
          >
            <div className="flex h-28 w-full items-end justify-center gap-0.5">
              <div
                className="w-[45%] max-w-[14px] rounded-t-[3px] bg-[var(--points)]"
                style={{ height: `${Math.max(4, (p.games / max) * 100)}%` }}
              />
              <div
                className="w-[45%] max-w-[14px] rounded-t-[3px] bg-[var(--admin)]"
                style={{ height: `${Math.max(4, (p.replays / max) * 100)}%` }}
              />
            </div>
            <span className="font-mono-num text-[9px] text-[var(--text-3)]">{p.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
