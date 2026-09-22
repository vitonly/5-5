import Link from "next/link";
import { PointsPill, PowerPill } from "@/components/StatPills";
import { rankLabel } from "@/lib/labels";
import { DOTA_ROLE_SHORT } from "@/lib/labels";
import { playerProfilePath } from "@/lib/utils";
import type { DotaRole } from "@prisma/client";

export interface TopPlayer {
  id: string;
  firstName: string;
  lastName?: string | null;
  username?: string | null;
  photoUrl?: string | null;
  finalRating: number;
  rankTier?: number | null;
  seasonCoefficient?: number;
  mmr?: number | null;
  primaryRole?: DotaRole | null;
  wins: number;
  losses: number;
  totalPoints: number;
}

const CLIP = "polygon(0 0, 100% 0, 100% 86%, 50% 100%, 0 86%)";

function PlaceholderCard({ rank, first }: { rank: number; first: boolean }) {
  const w = first ? 250 : 212;
  return (
    <div className="relative mx-auto" style={{ width: w }}>
      <div
        className="p-[2px]"
        style={{
          clipPath: CLIP,
          background: first
            ? "linear-gradient(180deg, var(--points), var(--points-border))"
            : "linear-gradient(180deg, #B4C2C2, #D7E1E1)",
        }}
      >
        <div
          className="flex flex-col items-center bg-[var(--surface)] px-4 pb-10 pt-5"
          style={{ clipPath: CLIP, minHeight: first ? 300 : 260 }}
        >
          <p className="font-mono-num text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-4)]">
            Место {rank}
          </p>
          <div className="mt-8 flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-[var(--border)] text-[var(--text-4)]">
            —
          </div>
          <p className="mt-4 font-mono-num text-sm text-[var(--text-3)]">Свободно</p>
        </div>
      </div>
    </div>
  );
}

export function TopPlayerCard({
  player,
  rank,
  viewer,
}: {
  player: TopPlayer | null | undefined;
  rank: 1 | 2 | 3 | number;
  viewer?: { id: string; role: string } | null;
}) {
  const first = rank === 1;
  const w = first ? 250 : 212;

  if (!player) {
    return <PlaceholderCard rank={rank} first={first} />;
  }

  const name = [player.firstName, player.lastName].filter(Boolean).join(" ");
  const role = player.primaryRole ? DOTA_ROLE_SHORT[player.primaryRole] : null;
  const canSeePower =
    viewer?.role === "ADMIN" || viewer?.id === player.id;

  return (
    <Link
      href={playerProfilePath(player.id, viewer)}
      className="relative mx-auto block transition-transform hover:-translate-y-0.5"
      style={{ width: w }}
    >
      <div
        className="p-[2px]"
        style={{
          clipPath: CLIP,
          background: first
            ? "linear-gradient(180deg, var(--points), var(--points-border))"
            : "linear-gradient(180deg, #B4C2C2, #D7E1E1)",
          boxShadow: first ? "0 12px 30px rgba(13,139,146,.18)" : undefined,
        }}
      >
        <div
          className="relative flex flex-col items-center bg-[var(--surface)] px-4 pb-12 pt-4"
          style={{ clipPath: CLIP, minHeight: first ? 320 : 280 }}
        >
          <div className="flex w-full items-start justify-between">
            {canSeePower ? (
              <PowerPill value={player.finalRating} />
            ) : (
              <span />
            )}
            <span className="font-mono-num text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-4)]">
              #{rank}
            </span>
          </div>

          <div className="mt-3 h-[88px] w-[88px] overflow-hidden rounded-full border-2 border-[var(--border)] bg-[var(--control)]">
            {player.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={player.photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="img-placeholder flex h-full w-full items-center justify-center font-mono-num text-[10px] text-[var(--text-4)]">
                фото
              </div>
            )}
          </div>

          <p className="mt-3 max-w-full truncate font-display text-[18px] font-bold uppercase tracking-wide text-[var(--text)]">
            {name || player.username || "Игрок"}
          </p>
          <p className="mt-1 text-center text-[13px] text-[var(--text-3)]">
            {rankLabel(player.rankTier)}
            {role ? ` · ${role}` : ""}
          </p>

          <div className="mt-3">
            <PointsPill value={player.totalPoints} />
          </div>
        </div>
      </div>
    </Link>
  );
}
