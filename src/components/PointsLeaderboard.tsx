import { PlayerLink } from "@/components/PlayerLink";
import { PointsPill } from "@/components/StatPills";
import { SEASON_PRIZES } from "@/lib/points";

interface LeaderboardEntry {
  userId: string;
  firstName: string;
  lastName?: string | null;
  username?: string | null;
  totalPoints: number;
  lifetimePoints?: number;
}

export function PointsLeaderboard({
  entries,
  viewer,
  showLifetime = false,
}: {
  entries: LeaderboardEntry[];
  viewer?: { id: string; role: string } | null;
  showLifetime?: boolean;
}) {
  if (entries.length === 0) {
    return <p className="text-[var(--text-2)]">Пока нет данных</p>;
  }

  return (
    <>
      {/* desktop table */}
      <div className="hidden overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--surface-muted)] text-left">
              <th className="px-4 py-3 font-mono-num text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-4)]">
                Место
              </th>
              <th className="px-4 py-3 font-mono-num text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-4)]">
                Игрок
              </th>
              <th className="px-4 py-3 text-right font-mono-num text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-4)]">
                Очки
              </th>
              {showLifetime && (
                <th className="px-4 py-3 text-right font-mono-num text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-4)]">
                  За всё время
                </th>
              )}
              <th className="px-4 py-3 font-mono-num text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-4)]">
                Приз
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => (
              <tr
                key={entry.userId}
                className={`border-t border-[var(--border-soft)] ${
                  index === 0 ? "bg-[#F2FBFB]" : "bg-[var(--surface)]"
                }`}
              >
                <td className="px-4 py-3 font-mono-num font-bold text-[var(--points)]">
                  {index + 1}
                </td>
                <td className="px-4 py-3">
                  <PlayerLink
                    user={{
                      id: entry.userId,
                      firstName: entry.firstName,
                      lastName: entry.lastName,
                      username: entry.username,
                    }}
                    viewer={viewer}
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <PointsPill value={entry.totalPoints} showLabel={false} />
                </td>
                {showLifetime && (
                  <td className="px-4 py-3 text-right font-mono-num text-[var(--text-3)]">
                    {entry.lifetimePoints ?? entry.totalPoints}
                  </td>
                )}
                <td className="px-4 py-3 text-[var(--text-2)]">
                  {index < SEASON_PRIZES.length ? SEASON_PRIZES[index] : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* mobile cards */}
      <div className="space-y-2 md:hidden">
        {entries.map((entry, index) => (
          <div
            key={entry.userId}
            className={`flex items-center justify-between rounded-[var(--radius-card)] border border-[var(--border)] px-4 py-3 ${
              index === 0 ? "border-l-[3px] border-l-[var(--points)]" : ""
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="font-mono-num w-6 font-bold text-[var(--points)]">{index + 1}</span>
              <PlayerLink
                user={{
                  id: entry.userId,
                  firstName: entry.firstName,
                  lastName: entry.lastName,
                  username: entry.username,
                }}
                viewer={viewer}
              />
            </div>
            <PointsPill value={entry.totalPoints} />
          </div>
        ))}
      </div>
    </>
  );
}
