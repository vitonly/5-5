import type { HistoryPoint } from "@/lib/rating-history";

/**
 * Линейный график по неделям (SVG, без библиотек).
 * invert — для места: 1-е место сверху.
 */
export function HistoryChart({
  title,
  points,
  invert = false,
  color = "var(--points)",
  format = (v: number) => String(v),
  emptyText,
  hint,
}: {
  title: string;
  points: HistoryPoint[];
  invert?: boolean;
  color?: string;
  format?: (v: number) => string;
  emptyText: string;
  hint?: string;
}) {
  const W = 320;
  const H = 120;
  const PAD_X = 8;
  const PAD_Y = 14;

  const last = points[points.length - 1];
  const first = points[0];
  const delta = last && first ? last.value - first.value : 0;
  const better = invert ? delta < 0 : delta > 0;

  let path = "";
  let area = "";
  let dots: { x: number; y: number }[] = [];
  if (points.length >= 2) {
    const vals = points.map((p) => p.value);
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    if (min === max) {
      min -= 1;
      max += 1;
    }
    dots = points.map((p, i) => {
      const x = PAD_X + (i / (points.length - 1)) * (W - PAD_X * 2);
      const t = (p.value - min) / (max - min);
      const y = invert ? PAD_Y + t * (H - PAD_Y * 2) : H - PAD_Y - t * (H - PAD_Y * 2);
      return { x, y };
    });
    path = dots.map((d, i) => `${i ? "L" : "M"}${d.x.toFixed(1)},${d.y.toFixed(1)}`).join(" ");
    area = `${path} L${dots[dots.length - 1].x.toFixed(1)},${H} L${dots[0].x.toFixed(1)},${H} Z`;
  }

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
          <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-[120px] w-full overflow-visible" preserveAspectRatio="none" aria-hidden>
            <defs>
              <linearGradient id={`fill-${title.length}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.18" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#fill-${title.length})`} />
            <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            {dots.map((d, i) => (
              <circle
                key={i}
                cx={d.x}
                cy={d.y}
                r={i === dots.length - 1 ? 4 : 2.5}
                fill={i === dots.length - 1 ? color : "var(--surface)"}
                stroke={color}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
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
