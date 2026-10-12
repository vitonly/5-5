import Link from "next/link";
import { Avatar } from "@/components/home/Avatar";
import { DOTA_ROLE_LABELS } from "@/lib/labels";
import { formatPoints } from "@/lib/points";
import { cn, displayName, playerProfilePath } from "@/lib/utils";
import type { DotaRole } from "@prisma/client";

export type SeasonRow = {
  id: string;
  place: number;
  firstName: string;
  lastName?: string | null;
  username?: string | null;
  photoUrl?: string | null;
  primaryRole?: DotaRole | null;
  totalPoints: number;
};

/**
 * Плотная таблица сезона в духе protracker: место, игрок, роль, полоска до лидера, очки.
 * Строка зрителя подсвечена; если он ниже видимой части — добавляется отдельной строкой.
 */
export function SeasonTable({
  rows,
  leaderPoints,
  viewer,
  viewerRow,
}: {
  rows: SeasonRow[];
  leaderPoints: number;
  viewer?: { id: string; role: string } | null;
  viewerRow?: SeasonRow | null;
}) {
  if (rows.length === 0 && !viewerRow) return null;

  const renderRow = (r: SeasonRow, gap = false) => {
    const me = viewer?.id === r.id;
    const pct = leaderPoints > 0 ? Math.max(4, Math.round((r.totalPoints / leaderPoints) * 100)) : 0;
    return (
      <li key={r.id} className={cn(gap && "border-t border-dashed border-[var(--border)]")}>
        <Link
          href={playerProfilePath(r.id, viewer)}
          className={cn(
            "flex min-h-[52px] items-center gap-3 px-3 py-2 transition-colors hover:bg-[var(--surface-muted)] min-[720px]:px-4",
            me && "bg-[var(--points-bg)]/60 hover:bg-[var(--points-bg)]"
          )}
        >
          <span className="w-6 shrink-0 text-right font-mono-num text-[13px] font-bold text-[var(--text-3)]">
            {r.place}
          </span>
          <Avatar photoUrl={r.photoUrl} firstName={r.firstName} lastName={r.lastName} size={30} />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span className="truncate text-[14px] font-semibold text-[var(--text)]">
                {me ? "Ты" : displayName(r)}
              </span>
              {r.primaryRole && (
                <span className="hidden shrink-0 text-[12px] text-[var(--text-3)] min-[480px]:inline">
                  {DOTA_ROLE_LABELS[r.primaryRole].replace(/\s*\(\d\)/, "")}
                </span>
              )}
            </span>
            <span className="mt-1 block h-1 overflow-hidden rounded-full bg-[var(--control)]">
              <span
                className="progress-fill block h-full rounded-full bg-[var(--points)]"
                style={{ width: `${pct}%` }}
              />
            </span>
          </span>
          <span className="w-12 shrink-0 text-right font-mono-num text-[14px] font-semibold text-[var(--points)]">
            {formatPoints(r.totalPoints)}
          </span>
        </Link>
      </li>
    );
  };

  return (
    <ol className="surface-card divide-y divide-[var(--border-soft)] overflow-hidden">
      {rows.map((r) => renderRow(r))}
      {viewerRow && renderRow(viewerRow, true)}
    </ol>
  );
}
