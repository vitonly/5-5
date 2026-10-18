"use client";

type Point = { label: string; solo: number; party: number; replays: number };

export function ProgressBarsChart({
  points,
  title = "Игры и реплеи",
}: {
  points: Point[];
  title?: string;
}) {
  if (!points.length) {
    return (
      <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5 text-sm text-[var(--text-3)] shadow-[var(--shadow-card)]">
        Пока нет данных за выбранный период.
      </div>
    );
  }

  const max = Math.max(
    1,
    ...points.map((p) => Math.max(p.solo, p.party, p.replays))
  );

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
      <p className="eyebrow text-[var(--text-3)]">{title}</p>
      <div className="mt-2 flex flex-wrap gap-4 text-[12px] text-[var(--text-3)]">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[var(--points)]" /> соло
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[var(--power)]" /> пати
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[var(--points-border)]" /> реплеи
        </span>
      </div>
      <div className="mt-4 flex h-40 items-end gap-1.5 overflow-x-auto">
        {points.map((p) => (
          <div
            key={p.label}
            className="flex min-w-[32px] flex-1 flex-col items-center gap-1"
            title={`${p.label}: соло ${p.solo}, пати ${p.party}, реплеев ${p.replays}`}
          >
            <div className="flex h-28 w-full items-end justify-center gap-0.5">
              <div
                className="w-[30%] max-w-[12px] rounded-t-[3px] bg-[var(--points)]"
                style={{ height: `${Math.max(p.solo ? 4 : 0, (p.solo / max) * 100)}%` }}
              />
              <div
                className="w-[30%] max-w-[12px] rounded-t-[3px] bg-[var(--power)]"
                style={{ height: `${Math.max(p.party ? 4 : 0, (p.party / max) * 100)}%` }}
              />
              <div
                className="w-[30%] max-w-[12px] rounded-t-[3px] bg-[var(--points-border)]"
                style={{ height: `${Math.max(p.replays ? 4 : 0, (p.replays / max) * 100)}%` }}
              />
            </div>
            <span className="font-mono-num text-[12px] text-[var(--text-3)]">{p.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
