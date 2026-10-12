import Link from "next/link";
import { ViewTransition } from "react";
import { PowerPill } from "@/components/StatPills";
import { CountUp } from "@/components/fx/CountUp";
import { TiltCard } from "@/components/fx/TiltCard";
import { PENNANT_CLIP } from "@/lib/fx";
import { cn, playerProfilePath } from "@/lib/utils";
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

/* Один рендер на все ширины: телефон — компактный подиум, ≥720px — крупный. */
const SIZE = {
  first: "w-[118px] min-[400px]:w-[132px] min-[720px]:w-[250px] aspect-[25/32]",
  other: "w-[98px] min-[400px]:w-[110px] min-[720px]:w-[212px] aspect-[53/70]",
};

function Frame({
  first,
  children,
}: {
  first: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="h-full p-[2px]"
      style={{
        clipPath: PENNANT_CLIP,
        background: first
          ? "linear-gradient(180deg, var(--points), var(--points-border))"
          : "linear-gradient(180deg, var(--border-field), var(--border))",
      }}
    >
      <div className="relative h-full overflow-hidden" style={{ clipPath: PENNANT_CLIP }}>
        {children}
      </div>
    </div>
  );
}

function RankChip({ rank, first }: { rank: number; first: boolean }) {
  return (
    <span
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-full font-mono-num text-[12px] font-bold shadow-[var(--shadow-xs)] min-[720px]:h-8 min-[720px]:w-8 min-[720px]:text-sm",
        first ? "bg-[var(--points)] text-[var(--on-points)]" : "bg-[var(--surface)] text-[var(--text)]"
      )}
      aria-label={`Место ${rank}`}
    >
      {rank}
    </span>
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
  const size = first ? SIZE.first : SIZE.other;
  const shadow = first
    ? "drop-shadow(0 16px 32px rgba(11, 122, 128, 0.24))"
    : "drop-shadow(0 8px 20px rgba(15, 26, 25, 0.10))";

  if (!player) {
    return (
      <div className={cn("relative mx-auto", size)} style={{ filter: shadow }}>
        <Frame first={first}>
          <div className="flex h-full flex-col items-center justify-end bg-[var(--surface)] px-2 pb-[18%] text-center">
            <RankChip rank={rank} first={first} />
            <p className="mt-2 text-[11px] text-[var(--text-3)] min-[720px]:text-sm">Свободно</p>
          </div>
        </Frame>
      </div>
    );
  }

  const name = [player.firstName, player.lastName].filter(Boolean).join(" ");
  const canSeePower = viewer?.role === "ADMIN" || viewer?.id === player.id;

  return (
    <Link
      href={playerProfilePath(player.id, viewer)}
      className={cn("press relative mx-auto block", size)}
      style={{ filter: shadow }}
    >
      <TiltCard className="h-full" shape={PENNANT_CLIP}>
        <div className={cn("relative", size)}>
          <Frame first={first}>
            <div className="absolute inset-0 bg-[var(--control)]">
              {player.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={player.photoUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover object-top"
                />
              ) : (
                <div className="img-placeholder absolute inset-0" />
              )}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(8,18,20,0.30) 0%, rgba(8,18,20,0.05) 35%, rgba(8,18,20,0.55) 68%, rgba(8,18,20,0.92) 100%)",
                }}
              />
            </div>

            <div className="relative z-[1] flex h-full flex-col px-2 pb-[17%] pt-2 min-[720px]:px-4 min-[720px]:pt-4">
              <div className="flex w-full items-start justify-between gap-1">
                {canSeePower ? (
                  <span className="hidden min-[720px]:inline-flex">
                    <PowerPill value={player.finalRating} />
                  </span>
                ) : (
                  <span />
                )}
                <span className="ml-auto">
                  <RankChip rank={rank} first={first} />
                </span>
              </div>

              <div className="mt-auto min-w-0 text-center">
                <ViewTransition name={`player-name-${player.id}`} share="morph">
                  <p className="truncate font-display text-[11px] font-bold uppercase leading-tight text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.45)] min-[400px]:text-[12px] min-[720px]:text-[16px]">
                    {name || player.username || "Игрок"}
                  </p>
                </ViewTransition>
                <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-[var(--points-border)] bg-[var(--points-bg)] px-2 py-0.5 text-[var(--points-ink)] min-[720px]:mt-3 min-[720px]:h-7 min-[720px]:px-2.5">
                  <span
                    className="inline-block h-[6px] w-[6px] shrink-0 bg-[var(--points)] min-[720px]:h-[7px] min-[720px]:w-[7px]"
                    style={{ transform: "rotate(45deg)" }}
                    aria-hidden
                  />
                  <CountUp
                    value={player.totalPoints}
                    className="font-mono-num text-[11px] font-semibold min-[720px]:text-[13px]"
                  />
                  <span className="hidden text-[11px] font-medium min-[720px]:inline">очк.</span>
                </span>
              </div>
            </div>
          </Frame>
        </div>
      </TiltCard>
    </Link>
  );
}
