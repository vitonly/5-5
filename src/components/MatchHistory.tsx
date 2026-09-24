import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { POSITION_LABELS } from "@/lib/labels";
import { formatPoints } from "@/lib/points";
import { formatDate } from "@/lib/utils";
import { parseTeamAssignments } from "@/lib/match-lineup";

export type MatchHistoryEntry = {
  gameId: string;
  gameNumber: number;
  sessionDate: Date | string;
  team: string;
  winnerTeam: string;
  won: boolean;
  pointsAwarded: number;
  position: number | null;
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
              className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium text-[var(--text)]">
                  {formatDate(e.sessionDate)} · игра {e.gameNumber}
                </p>
                <p className="text-xs text-[var(--text-3)]">
                  {e.team === "RADIANT" ? "Radiant" : "Dire"}
                  {e.position != null && (
                    <> · {POSITION_LABELS[e.position] ?? `поз. ${e.position}`}</>
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
      session: { date: Date; teamAssignments: string };
    };
  }[]
): MatchHistoryEntry[] {
  return participations
    .map((p) => {
      const assignments = parseTeamAssignments(p.game.session.teamAssignments);
      const position = assignments[userId]?.position ?? null;
      return {
        gameId: p.game.id,
        gameNumber: p.game.gameNumber,
        sessionDate: p.game.session.date,
        team: p.team,
        winnerTeam: p.game.winnerTeam,
        won: p.won,
        pointsAwarded: p.pointsAwarded,
        position,
      };
    })
    .sort((a, b) => {
      const da = new Date(a.sessionDate).getTime();
      const db = new Date(b.sessionDate).getTime();
      if (db !== da) return db - da;
      return b.gameNumber - a.gameNumber;
    });
}
