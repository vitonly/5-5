import Link from "next/link";
import { PointsPill, PowerPill } from "@/components/StatPills";
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
          className="flex flex-col items-center justify-end bg-[var(--surface)] px-4 pb-10 pt-5"
          style={{ clipPath: CLIP, minHeight: first ? 300 : 260 }}
        >
          <p className="font-mono-num text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-4)]">
            Место {rank}
          </p>
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
  const h = first ? 320 : 280;

  if (!player) {
    return <PlaceholderCard rank={rank} first={first} />;
  }

  const name = [player.firstName, player.lastName].filter(Boolean).join(" ");
  const canSeePower = viewer?.role === "ADMIN" || viewer?.id === player.id;

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
          className="relative overflow-hidden bg-[var(--control)]"
          style={{ clipPath: CLIP, height: h }}
        >
          {player.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={player.photoUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-top"
            />
          ) : (
            <div className="img-placeholder absolute inset-0 flex items-center justify-center font-mono-num text-xs text-[var(--text-4)]">
              фото
            </div>
          )}

          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(8,18,20,0.35) 0%, rgba(8,18,20,0.1) 35%, rgba(8,18,20,0.55) 70%, rgba(8,18,20,0.92) 100%)",
            }}
          />

          <div className="relative z-[1] flex h-full flex-col px-4 pb-10 pt-4">
            <div className="flex w-full items-start">
              {canSeePower ? <PowerPill value={player.finalRating} /> : <span />}
            </div>

            <div className="mt-auto min-w-0 text-center">
              <p className="truncate font-display text-[18px] font-bold uppercase tracking-wide text-white drop-shadow">
                {name || player.username || "Игрок"}
              </p>
              <div className="mt-3 flex justify-center">
                <PointsPill value={player.totalPoints} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
