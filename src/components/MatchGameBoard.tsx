"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { Avatar } from "@/components/home/Avatar";
import { PlayerLink } from "@/components/PlayerLink";
import { PositionBadge } from "@/components/RoleIcon";
import { CountUp } from "@/components/fx/CountUp";
import { Button } from "@/components/ui/button";
import { POSITION_LABELS } from "@/lib/labels";
import { formatPoints } from "@/lib/points";
import { cn } from "@/lib/utils";
import type { LineupSlot } from "@/lib/match-lineup";
import { seriesScoreForDisplayedSides } from "@/lib/match-score";
import { ReplayLanes, type ReplayView } from "@/components/match/ReplayLanes";

type UserRow = {
  id: string;
  firstName: string;
  lastName?: string | null;
  username?: string | null;
  photoUrl?: string | null;
  profile: { finalRating: number } | null;
};

type Viewer = { id: string; role: string };

export type MatchGameView = {
  gameNumber: number;
  radiantName: string;
  direName: string;
  radiant: LineupSlot[];
  dire: LineupSlot[];
  radiantPower: number;
  direPower: number;
  radiantPoints: number;
  direPoints: number;
  winnerTeam: "RADIANT" | "DIRE" | "DRAW" | string | null;
  /** Итоги из загруженной демки (если есть) */
  replay?: ReplayView | null;
};

/** Табло + составы с перелистыванием игр (для решафла №2). */
export function MatchGameBoard({
  seriesRadiantIds,
  seriesDireIds,
  seriesRadiantWins,
  seriesDireWins,
  games,
  userMap,
  viewer,
  mvpId,
}: {
  /** Составы игры 1 — к ним привязан счёт серии */
  seriesRadiantIds: string[];
  seriesDireIds: string[];
  seriesRadiantWins: number;
  seriesDireWins: number;
  games: MatchGameView[];
  userMap: Record<string, UserRow>;
  viewer: Viewer;
  mvpId?: string | null;
}) {
  const hasPlayed = games.some((g) => g.winnerTeam);
  const lastPlayedIdx = (() => {
    let last = 0;
    games.forEach((g, i) => {
      if (g.winnerTeam) last = i;
    });
    return last;
  })();
  const [idx, setIdx] = useState(lastPlayedIdx);
  const game = games[Math.min(idx, games.length - 1)] ?? games[0];
  const multi = games.length > 1;
  const anyReplay = games.some((g) => g.replay);
  const { leftWins, rightWins } = seriesScoreForDisplayedSides(
    game.radiant.map((s) => s.userId),
    seriesRadiantIds,
    seriesDireIds,
    seriesRadiantWins,
    seriesDireWins
  );

  return (
    <div className={cn("mx-auto px-4", anyReplay ? "max-w-[1120px]" : "max-w-[820px]", "pb-5 pt-4 min-[720px]:px-6 min-[720px]:pb-6")}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-3">
        <TeamHead name={game.radiantName} side="radiant" lineup={game.radiant} userMap={userMap} />
        <div className="text-center">
          {hasPlayed ? (
            <p className="font-display text-[30px] font-bold leading-none tracking-tight min-[720px]:text-[40px]">
              <CountUp value={leftWins} />
              <span className="mx-1.5 text-[var(--text-3)]">:</span>
              <CountUp value={rightWins} />
            </p>
          ) : (
            <p className="font-display text-[20px] font-bold text-[var(--text-3)]">VS</p>
          )}
          {hasPlayed && multi && (
            <p className="mt-1 text-[11px] text-[var(--text-3)]">
              серия · {game.radiantName.replace(/^Team\s+/i, "")} — {game.direName.replace(/^Team\s+/i, "")}
            </p>
          )}
        </div>
        <TeamHead name={game.direName} side="dire" lineup={game.dire} userMap={userMap} />
      </div>

      {multi && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 w-9 px-0"
            disabled={idx <= 0}
            aria-label="Предыдущая игра"
            onClick={() => setIdx((v) => Math.max(0, v - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1.5">
            {games.map((g, i) => (
              <button
                key={g.gameNumber}
                type="button"
                onClick={() => setIdx(i)}
                className={cn(
                  "press h-9 min-w-9 rounded-[var(--radius-control)] px-3 text-[13px] font-semibold transition-colors",
                  i === idx
                    ? "bg-[var(--points)] text-[var(--on-points)]"
                    : "bg-[var(--control)] text-[var(--text-2)] hover:text-[var(--text)]"
                )}
                aria-current={i === idx ? "true" : undefined}
              >
                Игра {g.gameNumber}
              </button>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 w-9 px-0"
            disabled={idx >= games.length - 1}
            aria-label="Следующая игра"
            onClick={() => setIdx((v) => Math.min(games.length - 1, v + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {game.replay ? (
        <ReplayLanes
          replay={game.replay}
          leftSlots={game.radiant}
          rightSlots={game.dire}
          leftName={game.radiantName}
          rightName={game.direName}
          userMap={userMap}
          viewer={viewer}
          mvpId={mvpId}
        />
      ) : (
        <>
          <PowerCompare radiant={game.radiantPower} dire={game.direPower} />
          <RoomLineup
            radiant={game.radiant}
            dire={game.dire}
            userMap={userMap}
            viewer={viewer}
            mvpId={mvpId}
          />
        </>
      )}

      {hasPlayed && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border-soft)] pt-4 text-[13px]">
          {games.map((g) => {
            const winner =
              g.winnerTeam === "RADIANT"
                ? g.radiantName
                : g.winnerTeam === "DIRE"
                  ? g.direName
                  : g.winnerTeam
                    ? "Ничья"
                    : null;
            if (!winner) return null;
            const dot =
              g.winnerTeam === "RADIANT"
                ? "bg-[var(--success)]"
                : g.winnerTeam === "DIRE"
                  ? "bg-[var(--danger)]"
                  : "bg-[var(--text-4)]";
            const active = g.gameNumber === game.gameNumber;
            return (
              <button
                key={g.gameNumber}
                type="button"
                onClick={() => setIdx(games.findIndex((x) => x.gameNumber === g.gameNumber))}
                className={cn(
                  "inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[var(--text-2)] transition-colors",
                  active ? "bg-[var(--points-bg)] text-[var(--points-ink)]" : "bg-[var(--control)] hover:bg-[var(--border-soft)]"
                )}
              >
                <span className={cn("h-2 w-2 shrink-0 rounded-full", dot)} aria-hidden />
                Игра {g.gameNumber}:
                <span className="min-w-0 truncate font-medium text-[var(--text)]">{winner}</span>
              </button>
            );
          })}
          {(game.radiantPoints !== 0 || game.direPoints !== 0) && (
            <span className="ml-auto text-[12px] text-[var(--text-3)]">
              очки за игру {game.gameNumber}:{" "}
              <span className="font-mono-num text-[var(--points)]">{formatPoints(game.radiantPoints)}</span>
              {" / "}
              <span className="font-mono-num text-[var(--points)]">{formatPoints(game.direPoints)}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function TeamHead({
  name,
  side,
  lineup,
  userMap,
}: {
  name: string;
  side: "radiant" | "dire";
  lineup: LineupSlot[];
  userMap: Record<string, UserRow>;
}) {
  const right = side === "dire";
  return (
    <div className={cn("min-w-0", right && "text-right")}>
      <div className={cn("mb-2 flex", right && "justify-end")}>
        {lineup.map((slot, i) => {
          const u = userMap[slot.userId];
          return (
            <span
              key={slot.userId}
              className={cn("rounded-full ring-2 ring-[var(--surface)]", i > 0 && "-ml-2.5 min-[720px]:-ml-3")}
              style={{ zIndex: lineup.length - i }}
            >
              <Avatar
                photoUrl={u?.photoUrl}
                firstName={u?.firstName}
                lastName={u?.lastName}
                size={28}
                className="min-[720px]:!h-9 min-[720px]:!w-9"
              />
            </span>
          );
        })}
      </div>
      <p className={cn("flex items-center", right && "flex-row-reverse")}>
        <span className="truncate text-[14px] font-semibold text-[var(--text)] min-[720px]:text-[16px]">{name}</span>
      </p>
    </div>
  );
}

function PowerCompare({ radiant, dire }: { radiant: number; dire: number }) {
  const total = radiant + dire;
  if (total <= 0) return null;
  const left = Math.round((radiant / total) * 100);
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-center justify-between text-[12px] text-[var(--text-3)]">
        <span>
          сила <span className="font-mono-num font-semibold text-[var(--power)]">{Math.round(radiant)}</span>
        </span>
        <span>
          <span className="font-mono-num font-semibold text-[var(--power)]">{Math.round(dire)}</span> сила
        </span>
      </div>
      <div
        className="flex h-1.5 gap-0.5 overflow-hidden rounded-full"
        role="img"
        aria-label={`Сила команд: ${Math.round(radiant)} против ${Math.round(dire)}`}
      >
        <span className="rounded-l-full bg-[var(--power)]" style={{ width: `${left}%` }} />
        <span className="flex-1 rounded-r-full bg-[var(--power-border)]" />
      </div>
    </div>
  );
}

function RoomLineup({
  radiant,
  dire,
  userMap,
  viewer,
  mvpId,
}: {
  radiant: LineupSlot[];
  dire: LineupSlot[];
  userMap: Record<string, UserRow>;
  viewer: Viewer;
  mvpId?: string | null;
}) {
  const showPower = viewer.role === "ADMIN";

  const tile = (slot: LineupSlot) => {
    const u = userMap[slot.userId];
    const me = slot.userId === viewer.id;
    const isMvp = Boolean(mvpId && slot.userId === mvpId);
    return (
      <li
        key={slot.userId}
        className={cn(
          "flex min-h-[48px] items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 min-[720px]:gap-3 min-[720px]:px-3",
          me ? "bg-[var(--points-bg)]" : "bg-[var(--surface-muted)]"
        )}
      >
        <Avatar
          photoUrl={u?.photoUrl}
          firstName={u?.firstName}
          lastName={u?.lastName}
          size={30}
          className="min-[720px]:!h-9 min-[720px]:!w-9"
        />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1">
            {u ? (
              <PlayerLink
                user={u}
                viewer={viewer}
                className={cn("min-w-0 truncate text-[13px] min-[720px]:text-[14px]", me && "text-[var(--points-ink)]")}
              >
                {me ? "Ты" : undefined}
              </PlayerLink>
            ) : (
              <span className="truncate text-[13px]">{slot.userId}</span>
            )}
            {isMvp && (
              <Star className="h-3.5 w-3.5 shrink-0 fill-[var(--warning)] text-[var(--warning)]" aria-label="MVP" />
            )}
          </span>
          <span className="block truncate text-[11px] text-[var(--text-3)]">
            {POSITION_LABELS[slot.position]?.split("·")[1]?.trim()}
            {showPower && u?.profile && (
              <span className="ml-1.5 font-mono-num text-[var(--power)]">{u.profile.finalRating}</span>
            )}
          </span>
        </span>
        <PositionBadge position={slot.position} className="min-[720px]:h-6 min-[720px]:w-6 min-[720px]:text-[12px]" />
      </li>
    );
  };

  return (
    <div className="mt-4 grid grid-cols-2 gap-2 min-[720px]:gap-3">
      <ul className="space-y-1.5 min-[720px]:space-y-2">{radiant.map(tile)}</ul>
      <ul className="space-y-1.5 min-[720px]:space-y-2">{dire.map(tile)}</ul>
    </div>
  );
}
