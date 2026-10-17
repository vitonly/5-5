"use client";

import { useMemo, useState } from "react";
import type { HistoryPoint } from "@/lib/rating-history";

/**
 * Линейный график по неделям (SVG, без библиотек).
 * invert — для места: 1-е место сверху.
 * На точках перегиба (смена направления) — hover с местом и датой.
 */
export function HistoryChart({
  title,
  points,
  invert = false,
  color = "var(--points)",
  formatAs = "number",
  emptyText,
  hint,
}: {
  title: string;
  points: HistoryPoint[];
  invert?: boolean;
  color?: string;
  /** Serialisable (client component) — no function props from server. */
  formatAs?: "number" | "place";
  emptyText: string;
  hint?: string;
}) {
  const W = 320;
  const H = 120;
  const PAD_X = 8;
  const PAD_Y = 14;
  const [hover, setHover] = useState<number | null>(null);
  const format = (v: number) => (formatAs === "place" ? `#${v}` : String(v));

  const last = points[points.length - 1];
  const first = points[0];
  const delta = last && first ? last.value - first.value : 0;
  const better = invert ? delta < 0 : delta > 0;

  const { path, area, dots, inflection } = useMemo(() => {
    if (points.length < 2) return { path: "", area: "", dots: [] as { x: number; y: number }[], inflection: new Set<number>() };
    const vals = points.map((p) => p.value);
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const ds = points.map((p, i) => {
      const x = PAD_X + (i / (points.length - 1)) * (W - PAD_X * 2);
      const t = (p.value - min) / (max - min);
      const y = invert ? PAD_Y + t * (H - PAD_Y * 2) : H - PAD_Y - t * (H - PAD_Y * 2);
      return { x, y };
    });
    const pth = ds.map((d, i) => `${i ? "L" : "M"}${d.x.toFixed(1)},${d.y.toFixed(1)}`).join(" ");
    const ar = `${pth} L${ds[ds.length - 1].x.toFixed(1)},${H} L${ds[0].x.toFixed(1)},${H} Z`;
    const turns = new Set<number>();
    for (let i = 1; i < vals.length - 1; i++) {
      const d0 = vals[i] - vals[i - 1];
      const d1 = vals[i + 1] - vals[i];
      if (d0 === 0 && d1 === 0) continue;
      if ((d0 > 0 && d1 < 0) || (d0 < 0 && d1 > 0) || (d0 === 0 && d1 !== 0) || (d0 !== 0 && d1 === 0)) {
        turns.add(i);
      }
    }
    return { path: pth, area: ar, dots: ds, inflection: turns };
  }, [points, invert]);

  const hoverPoint = hover != null ? points[hover] : null;
  const hoverDot = hover != null ? dots[hover] : null;

  return (
    <div className="surface-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{title}</p>
          {last && (
            <p className="mt-1 font-mono-num text-[24px] font-bold leading-tight" style={{ color }}>
              {format(last.value)}
            </p>
          )}
        </div>
        {points.length >= 2 && delta !== 0 && (
          <span
            className="rounded-full px-2 py-0.5 font-mono-num text-[12px] font-bold"
            style={{
              background: better ? "var(--success-bg)" : "var(--danger-bg)",
              color: better ? "var(--success-ink)" : "var(--danger)",
            }}
          >
            {better ? "▲" : "▼"} {Math.abs(delta)}
          </span>
        )}
      </div>

      {points.length >= 2 ? (
        <>
          <div className="relative mt-3">
            <svg viewBox={`0 0 ${W} ${H}`} className="h-[120px] w-full overflow-visible" preserveAspectRatio="none" aria-hidden>
              <defs>
                <linearGradient id={`fill-${title.length}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.18" />
                  <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={area} fill={`url(#fill-${title.length})`} />
              <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              {dots.map((d, i) => {
                const isTurn = inflection.has(i) || i === dots.length - 1 || i === 0;
                const active = hover === i;
                return (
                  <circle
                    key={i}
                    cx={d.x}
                    cy={d.y}
                    r={active ? 5 : i === dots.length - 1 ? 4 : isTurn ? 3.5 : 2.5}
                    fill={active || i === dots.length - 1 ? color : "var(--surface)"}
                    stroke={color}
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                    className={isTurn ? "cursor-pointer" : undefined}
                    onMouseEnter={() => isTurn && setHover(i)}
                    onMouseLeave={() => setHover(null)}
                  />
                );
              })}
            </svg>
            {hoverPoint && hoverDot && (
              <div
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-2 py-1 shadow-[var(--shadow-card)]"
                style={{
                  left: `${(hoverDot.x / W) * 100}%`,
                  top: `${(hoverDot.y / H) * 100}%`,
                  marginTop: -8,
                }}
              >
                <p className="whitespace-nowrap font-mono-num text-[13px] font-bold" style={{ color }}>
                  {format(hoverPoint.value)}
                </p>
                <p className="whitespace-nowrap text-[11px] text-[var(--text-3)]">{hoverPoint.label}</p>
              </div>
            )}
          </div>
          <div className="mt-1 flex justify-between font-mono-num text-[11px] text-[var(--text-3)]">
            <span>{first.label}</span>
            <span>{last.label}</span>
          </div>
        </>
      ) : (
        <p className="mt-4 rounded-[var(--radius-control)] bg-[var(--surface-muted)] px-3 py-6 text-center text-[13px] text-[var(--text-3)]">
          {emptyText}
        </p>
      )}
      {hint && <p className="mt-2 text-[11px] text-[var(--text-3)]">{hint}</p>}
    </div>
  );
}
