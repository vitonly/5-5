import { PlayerLink } from "@/components/PlayerLink";
import { SEASON_PRIZES, formatPoints } from "@/lib/points";
import { cn } from "@/lib/utils";

interface LeaderboardEntry {
  userId: string;
  firstName: string;
  lastName?: string | null;
  username?: string | null;
  photoUrl?: string | null;
  totalPoints: number;
  lifetimePoints?: number;
}

const MEDAL: Record<number, { bg: string; color: string }> = {
  0: { bg: "linear-gradient(180deg, var(--gold-light), var(--gold))", color: "#fff" },
  1: { bg: "linear-gradient(180deg, var(--silver-light), var(--silver))", color: "#fff" },
  2: { bg: "linear-gradient(180deg, var(--bronze-light), var(--bronze))", color: "#fff" },
};

/** Номер места: топ-3 — медаль, остальные — моноширинная цифра */
function Place({ index }: { index: number }) {
  const medal = MEDAL[index];
  if (medal) {
    return (
      <span
        className="inline-flex h-7 w-7 items-center justify-center rounded-full font-mono-num text-[13px] font-bold shadow-[var(--shadow-xs)]"
        style={{ background: medal.bg, color: medal.color }}
      >
        {index + 1}
      </span>
    );
  }
  return (
    <span className="inline-flex h-7 w-7 items-center justify-center font-mono-num text-[14px] font-semibold text-[var(--text-3)]">
      {index + 1}
    </span>
  );
}

function You() {
  return (
    <span className="ml-1.5 shrink-0 rounded-full bg-[var(--points)] px-1.5 py-px text-[11px] font-bold uppercase tracking-wide text-white">
      вы
    </span>
  );
}

export function PointsLeaderboard({
  entries,
  viewer,
  showLifetime = false,
  seasonColumnLabel = "Очки",
}: {
  entries: LeaderboardEntry[];
  viewer?: { id: string; role: string } | null;
  showLifetime?: boolean;
  seasonColumnLabel?: string;
}) {
  if (entries.length === 0) {
    return (
      <p className="surface-card px-4 py-10 text-center text-sm text-[var(--text-3)]">Пока нет данных</p>
    );
  }

  const cols = showLifetime
    ? "grid-cols-[32px_minmax(0,1fr)_auto] min-[720px]:grid-cols-[48px_minmax(0,1fr)_180px_120px_96px]"
    : "grid-cols-[32px_minmax(0,1fr)_auto] min-[720px]:grid-cols-[48px_minmax(0,1fr)_180px_96px]";

  return (
    <div className="surface-card overflow-hidden" role="table" aria-label="Таблица лидеров">
      <div
        role="row"
        className={cn("hidden items-center gap-3 bg-[var(--surface-muted)] px-4 py-3 min-[720px]:grid", cols)}
      >
        <span role="columnheader" className="eyebrow">#</span>
        <span role="columnheader" className="eyebrow">Игрок</span>
        <span role="columnheader" className="eyebrow">Приз</span>
        {showLifetime && <span role="columnheader" className="eyebrow text-right">За всё время</span>}
        <span role="columnheader" className="eyebrow text-right">{seasonColumnLabel}</span>
      </div>
      {entries.map((entry, index) => {
        const me = viewer?.id === entry.userId;
        const prize = index < SEASON_PRIZES.length ? SEASON_PRIZES[index] : null;
        return (
          <div
            key={entry.userId}
            role="row"
            className={cn(
              "grid items-center gap-3 border-t border-[var(--border-soft)] px-3 py-2.5 first:border-t-0 min-[720px]:px-4 min-[720px]:py-3 min-[720px]:first:border-t",
              cols,
              me ? "bg-[var(--points-bg)]" : "bg-[var(--surface)]"
            )}
          >
            <span role="cell">
              <Place index={index} />
            </span>
            <div role="cell" className="min-w-0">
              <div className="flex min-w-0 items-center">
                <PlayerLink
                  user={{
                    id: entry.userId,
                    firstName: entry.firstName,
                    lastName: entry.lastName,
                    username: entry.username,
                    photoUrl: entry.photoUrl,
                  }}
                  viewer={viewer}
                  avatar={30}
                />
                {me && <You />}
              </div>
              {prize && <p className="mt-0.5 pl-[38px] text-[11px] text-[var(--gold-ink)] min-[720px]:hidden">{prize}</p>}
            </div>
            <span role="cell" className="hidden text-[13px] min-[720px]:block">
              {prize ? (
                <span className="font-medium text-[var(--gold-ink)]">{prize}</span>
              ) : (
                <span className="text-[var(--text-3)]">—</span>
              )}
            </span>
            {showLifetime && (
              <span role="cell" className="hidden text-right font-mono-num text-[var(--text-3)] min-[720px]:block">
                {formatPoints(entry.lifetimePoints ?? entry.totalPoints)}
              </span>
            )}
            <div role="cell" className="text-right">
              <span className="font-mono-num text-[15px] font-bold text-[var(--points-ink)]">
                {formatPoints(entry.totalPoints)}
              </span>
              {showLifetime && (
                <p className="whitespace-nowrap font-mono-num text-[12px] text-[var(--text-3)] min-[720px]:hidden">
                  всего {formatPoints(entry.lifetimePoints ?? entry.totalPoints)}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
