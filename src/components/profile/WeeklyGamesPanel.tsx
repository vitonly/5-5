import { cn } from "@/lib/utils";

/**
 * Панель «Игры и реплеи» в профиле ученика.
 *
 * Сверху — крупные цифры текущей недели (соло, пати, реплеи), разница с прошлой неделей
 * и сумма за весь период. Ниже — сетка «неделя × вид»: в каждой клетке число,
 * чем больше, тем темнее клетка. Так цифры видно сразу, без наведения на столбики.
 *
 * На телефоне в сетке только 4 последние недели (8 узких клеток не читаются),
 * на компьютере — все 8.
 */

type Point = { label: string; solo: number; party: number; replays: number };

type Tone = "teal" | "amber";

// Ступени заливки клетки: пусто / мало / средне / много (на тёмных — белая цифра)
const STEPS: Record<Tone, string[]> = {
  teal: [
    "bg-[var(--surface-muted)] text-[var(--text-4)]",
    "bg-[var(--points-bg)] text-[var(--points-ink)]",
    "bg-[var(--points-border)] text-[var(--points-ink)]",
    "bg-[var(--points)] text-[var(--on-points)]",
  ],
  amber: [
    "bg-[var(--surface-muted)] text-[var(--text-4)]",
    "bg-[var(--warning-bg)] text-[var(--warning-ink)]",
    "bg-[var(--warning-border)] text-[var(--warning-ink)]",
    "bg-[var(--warning-ink)] text-[var(--on-points)]",
  ],
};

/** Какая ступень заливки: доля от максимума в этой строке */
function step(v: number, max: number) {
  if (!v) return 0;
  const k = v / max;
  return k > 0.66 ? 3 : k > 0.33 ? 2 : 1;
}

const MOBILE_WEEKS = 4;

// Колонки сетки: подпись строки, недели, «всего». На телефоне 4 недели, с 720px — 8
const GRID =
  "grid grid-cols-[60px_repeat(4,minmax(0,1fr))_40px] gap-1.5 min-[720px]:grid-cols-[76px_repeat(8,minmax(0,1fr))_48px]";

export function WeeklyGamesPanel({ points }: { points: Point[] }) {
  if (!points.length) {
    return (
      <div className="surface-card p-5 text-sm text-[var(--text-3)]">
        Игры появятся здесь, как только OpenDota увидит твои матчи.
      </div>
    );
  }

  const last = points.length - 1;
  const firstMobile = Math.max(0, points.length - MOBILE_WEEKS);
  const sum = (list: Point[], key: keyof Omit<Point, "label">) => list.reduce((s, p) => s + p[key], 0);
  const recent = points.slice(firstMobile);

  const rows: { key: "solo" | "party" | "replays"; name: string; tone: Tone }[] = [
    { key: "solo", name: "Соло", tone: "teal" },
    { key: "party", name: "Пати", tone: "teal" },
    { key: "replays", name: "Реплеи", tone: "amber" },
  ];

  // Крупные цифры: эта неделя и разница с прошлой
  const kpis = rows.map((r) => {
    const now = points[last][r.key];
    const before = last > 0 ? points[last - 1][r.key] : 0;
    const d = now - before;
    return {
      ...r,
      now,
      total: sum(points, r.key),
      delta: d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : "±0",
      deltaCls: d > 0 ? "text-[var(--success-ink)]" : d < 0 ? "text-[var(--danger)]" : "text-[var(--text-3)]",
    };
  });

  const games = sum(points, "solo") + sum(points, "party");
  const gamesRecent = sum(recent, "solo") + sum(recent, "party");

  return (
    <section className="surface-card flex flex-col gap-4 p-4 min-[720px]:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-[17px] leading-6">Игры и реплеи</h3>
        <span className="text-[13px] text-[var(--text-3)]">эта неделя — с {points[last].label}</span>
      </div>

      {/* Итоги крупно */}
      <div className="grid grid-cols-3 gap-2 min-[720px]:gap-3">
        {kpis.map((k) => (
          <div key={k.key} className="flex min-w-0 flex-col gap-0.5 rounded-[var(--radius-control)] bg-[var(--surface-muted)] px-3 py-2.5 min-[720px]:px-3.5 min-[720px]:py-3">
            <span className="eyebrow text-[var(--text-3)]">{k.name}</span>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono-num text-[26px] font-bold leading-8 min-[720px]:text-[32px] min-[720px]:leading-[38px]">
                {k.now}
              </span>
              <span className={cn("font-mono-num text-[13px] font-semibold", k.deltaCls)} title="К прошлой неделе">
                {k.delta}
              </span>
            </div>
            <span className="text-[12px] text-[var(--text-3)]">
              за {points.length} нед. <b className="font-mono-num text-[var(--text)]">{k.total}</b>
            </span>
          </div>
        ))}
      </div>

      {/* Сетка: неделя × вид */}
      <div className="flex flex-col gap-1.5">
        <div className={cn(GRID, "items-center")}>
          <span className="eyebrow text-[var(--text-3)]">Недели</span>
          {points.map((p, i) => (
            <span
              key={p.label}
              className={cn(
                "text-center font-mono-num text-[12px]",
                i < firstMobile && "hidden min-[720px]:block",
                i === last ? "font-bold text-[var(--points-ink)]" : "text-[var(--text-3)]"
              )}
            >
              {p.label}
            </span>
          ))}
          <span className="eyebrow text-right text-[var(--text-3)]">Всего</span>
        </div>

        {rows.map((r) => {
          const max = Math.max(1, ...points.map((p) => p[r.key]));
          return (
            <div key={r.key} className={cn(GRID, "items-center")}>
              <span className="text-[14px] font-medium text-[var(--text-2)]">{r.name}</span>
              {points.map((p, i) => {
                const v = p[r.key];
                return (
                  <div
                    key={p.label}
                    title={`${p.label}: ${r.name.toLowerCase()} — ${v}`}
                    className={cn(
                      "flex h-12 items-center justify-center rounded-[var(--radius-control)] font-mono-num text-[17px] font-bold min-[720px]:h-[52px] min-[720px]:text-[18px]",
                      STEPS[r.tone][step(v, max)],
                      i < firstMobile && "hidden min-[720px]:flex",
                      // текущая неделя — с обводкой
                      i === last && "outline outline-2 outline-offset-2 outline-[var(--points-border)]"
                    )}
                  >
                    {v || "·"}
                  </div>
                );
              })}
              {/* «Всего» по строке — за видимые недели (на телефоне 4, на компьютере 8) */}
              <span className="text-right font-mono-num text-[18px] font-bold min-[720px]:text-[20px]">
                <span className="min-[720px]:hidden">{sum(recent, r.key)}</span>
                <span className="hidden min-[720px]:inline">{sum(points, r.key)}</span>
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--border-soft)] pt-3">
        <span className="text-[13px] text-[var(--text-2)]">
          <span className="min-[720px]:hidden">Всего игр за {recent.length} нед.</span>
          <span className="hidden min-[720px]:inline">Всего игр за {points.length} нед. · чем темнее клетка, тем больше</span>
        </span>
        <span className="font-mono-num text-[26px] font-bold leading-8 min-[720px]:text-[28px]">
          <span className="min-[720px]:hidden">{gamesRecent}</span>
          <span className="hidden min-[720px]:inline">{games}</span>
        </span>
      </div>
    </section>
  );
}
