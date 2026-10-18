import { Badge } from "@/components/ui/badge";
import { DotaImg } from "@/components/match/DotaImg";
import { heroInfo, type ReplayData } from "@/lib/replay";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { POSITION_LABELS } from "@/lib/labels";
import { formatPoints } from "@/lib/points";
import { formatShortDate } from "@/lib/format";
import { parseTeamAssignments } from "@/lib/match-lineup";
import { sideFallback, teamDisplayName, type SideCode } from "@/lib/team-names";

export type MatchHistoryEntry = {
  gameId: string;
  gameNumber: number;
  sessionDate: Date | string;
  team: string;
  teamLabel: string;
  winnerTeam: string;
  won: boolean;
  pointsAwarded: number;
  position: number | null;
  /** Из демки (если загружена) */
  heroId: number | null;
  kda: { k: number; d: number; a: number } | null;
};

export type MatchHistoryPlayer = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  finalRating?: number | null;
};

export function MatchHistory({
  entries,
  title = "История матчей 5v5",
}: {
  entries: MatchHistoryEntry[];
  title?: string;
}) {
  if (entries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--text-3)]">Пока нет сыгранных игр</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {entries.map((e) => {
          const result =
            e.winnerTeam === "DRAW" ? "Ничья" : e.won ? "Победа" : "Поражение";
          const badgeVariant =
            e.winnerTeam === "DRAW" ? "default" : e.won ? "success" : "danger";
          return (
            <div
              key={e.gameId}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm"
            >
              {e.heroId != null && (
                <DotaImg
                  src={heroInfo(e.heroId).img}
                  alt={heroInfo(e.heroId).name}
                  className="h-[30px] w-[52px] shrink-0 rounded-[5px] object-cover"
                />
              )}
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="font-medium text-[var(--text)]">
                  {formatShortDate(e.sessionDate)} · игра {e.gameNumber}
                </p>
                <p className="text-xs text-[var(--text-3)]">
                  {e.teamLabel}
                  {e.position != null && (
                    <> · {POSITION_LABELS[e.position] ?? `поз. ${e.position}`}</>
                  )}
                  {e.heroId != null && <> · {heroInfo(e.heroId).name}</>}
                  {e.kda && (
                    <span className="font-mono-num">
                      {" "}
                      · {e.kda.k}/{e.kda.d}/{e.kda.a}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={badgeVariant}>{result}</Badge>
                <span
                  className={`font-mono-num text-sm font-bold ${
                    e.pointsAwarded > 0
                      ? "text-[var(--success)]"
                      : e.pointsAwarded < 0
                        ? "text-[var(--danger)]"
                        : "text-[var(--text-3)]"
                  }`}
                >
                  {e.pointsAwarded > 0 ? "+" : ""}
                  {formatPoints(e.pointsAwarded)}
                </span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function buildMatchHistoryEntries(
  userId: string,
  participations: {
    won: boolean;
    pointsAwarded: number;
    team: string;
    game: {
      id: string;
      gameNumber: number;
      winnerTeam: string;
      session: {
        date: Date;
        teamAssignments: string;
        teamAssignmentsGame2?: string | null;
        replays?: { gameNumber: number; data: unknown }[];
      };
    };
  }[],
  playersById: Record<string, MatchHistoryPlayer> = {}
): MatchHistoryEntry[] {
  return participations
    .map((p) => {
      const useGame2 =
        p.game.gameNumber >= 2 &&
        Boolean(
          p.game.session.teamAssignmentsGame2 &&
            p.game.session.teamAssignmentsGame2 !== "{}"
        );
      const assignments = parseTeamAssignments(
        useGame2
          ? p.game.session.teamAssignmentsGame2!
          : p.game.session.teamAssignments
      );
      const position = assignments[userId]?.position ?? null;
      const side = (p.team === "DIRE" ? "DIRE" : "RADIANT") as SideCode;
      const teammates = Object.entries(assignments)
        .filter(([, a]) => a.team === side)
        .map(([id]) => ({
          id,
          firstName: playersById[id]?.firstName,
          lastName: playersById[id]?.lastName,
          username: playersById[id]?.username,
          finalRating: playersById[id]?.finalRating ?? 0,
        }));
      const replay = p.game.session.replays?.find((r) => r.gameNumber === p.game.gameNumber);
      const me = replay ? ((replay.data as ReplayData | null)?.players ?? []).find((x) => x.userId === userId) : undefined;
      return {
        gameId: p.game.id,
        gameNumber: p.game.gameNumber,
        sessionDate: p.game.session.date,
        team: p.team,
        teamLabel: teamDisplayName(teammates, sideFallback(side)),
        winnerTeam: p.game.winnerTeam,
        won: p.won,
        pointsAwarded: p.pointsAwarded,
        position,
        heroId: me?.heroId ?? null,
        kda: me ? { k: me.kills, d: me.deaths, a: me.assists } : null,
      };
    })
    .sort((a, b) => {
      const da = new Date(a.sessionDate).getTime();
      const db = new Date(b.sessionDate).getTime();
      if (db !== da) return db - da;
      return b.gameNumber - a.gameNumber;
    });
}
