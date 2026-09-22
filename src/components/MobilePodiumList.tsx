import Link from "next/link";
import { PointsPill, PowerPill } from "@/components/StatPills";
import { rankLabel, DOTA_ROLE_SHORT } from "@/lib/labels";
import { playerProfilePath } from "@/lib/utils";
import type { TopPlayer } from "@/components/TopPlayerCard";

export function MobilePodiumList({
  players,
  viewer,
}: {
  players: TopPlayer[];
  viewer?: { id: string; role: string } | null;
}) {
  if (players.length === 0) {
    return (
      <p className="text-center text-[var(--text-2)]">
        Игроки появятся здесь, как только добавятся ученики.
      </p>
    );
  }

  return (
    <ol className="space-y-2">
      {players.map((player, i) => {
        const rank = i + 1;
        const name = [player.firstName, player.lastName].filter(Boolean).join(" ");
        const role = player.primaryRole ? DOTA_ROLE_SHORT[player.primaryRole] : null;
        const canSeePower = viewer?.role === "ADMIN" || viewer?.id === player.id;
        const medal =
          rank === 1
            ? "border-[var(--points-border)] bg-[var(--points-bg)]"
            : "border-[var(--border)] bg-[var(--surface)]";

        return (
          <li key={player.id}>
            <Link
              href={playerProfilePath(player.id, viewer)}
              className={`flex min-h-[56px] items-center gap-3 rounded-[var(--radius-card)] border px-3 py-2.5 ${medal}`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-mono-num text-sm font-bold ${
                  rank === 1
                    ? "bg-[var(--points)] text-white"
                    : "bg-[var(--control)] text-[var(--text-2)]"
                }`}
              >
                {rank}
              </span>
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--control)]">
                {player.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={player.photoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="img-placeholder h-full w-full" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-[15px] font-bold uppercase tracking-wide text-[var(--text)]">
                  {name || player.username || "Игрок"}
                </p>
                <p className="truncate text-[12px] text-[var(--text-3)]">
                  {rankLabel(player.rankTier)}
                  {role ? ` · ${role}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <PointsPill value={player.totalPoints} />
                {canSeePower && <PowerPill value={player.finalRating} />}
              </div>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
