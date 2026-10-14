import { Star } from "lucide-react";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { MATCH_STATUS_LABELS } from "@/lib/labels";
import { cn, displayName, parseJsonArray } from "@/lib/utils";
import { formatShortDate, formatShortDateTime } from "@/lib/format";
import { PlayerLink } from "@/components/PlayerLink";
import { MatchNav } from "@/components/MatchNav";
import { MatchGameBoard, type MatchGameView } from "@/components/MatchGameBoard";
import { MatchMvpClient } from "@/components/MatchMvpClient";
import type { ReplayData } from "@/lib/replay";
import { PageHeader } from "@/components/ui/page-header";
import { teamDisplayName } from "@/lib/team-names";
import { parseTeamAssignments } from "@/lib/match-lineup";
import { lineupsForGame, seriesScoreByGame1Roster } from "@/lib/match-score";

export const metadata = { title: "Субботние 5v5" };

export const dynamic = "force-dynamic";

type UserRow = {
  id: string;
  firstName: string;
  lastName?: string | null;
  username?: string | null;
  photoUrl?: string | null;
  profile: { finalRating: number } | null;
};

type Viewer = { id: string; role: string };

type SessionWithGames = Awaited<ReturnType<typeof loadSessions>>[number];

async function loadSessions() {
  return prisma.matchSession.findMany({
    include: {
      games: {
        include: { participants: true },
        orderBy: { gameNumber: "asc" },
      },
      replays: { orderBy: { gameNumber: "asc" } },
    },
    orderBy: { date: "desc" },
    take: 10,
  });
}

export default async function MatchPage() {
  const user = await getSessionUser();
  if (!user) return null;

  const sessions = await loadSessions();

  const allIds = [
    ...new Set(
      sessions.flatMap((s) => {
        const g2 = parseTeamAssignments(s.teamAssignmentsGame2);
        const fromReplays = s.replays.flatMap((r) =>
          ((r.data as unknown as ReplayData)?.players ?? []).map((p) => p.userId).filter((x): x is string => Boolean(x))
        );
        return [
          ...parseJsonArray(s.radiantPlayerIds),
          ...parseJsonArray(s.direPlayerIds),
          ...Object.keys(g2),
          ...fromReplays,
        ];
      })
    ),
  ];

  const users = await prisma.user.findMany({
    where: { id: { in: allIds } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      username: true,
      photoUrl: true,
      profile: { select: { finalRating: true } },
    },
  });
  const userMap: Record<string, UserRow> = Object.fromEntries(users.map((u) => [u.id, u]));

  const featured = sessions.find((s) => s.status !== "COMPLETED") ?? sessions[0];
  const rest = sessions.filter((s) => s.id !== featured?.id);
  const numberOf = (s: SessionWithGames) => sessions.length - sessions.indexOf(s);

  return (
    <div>
      <PageHeader eyebrow="Каждую субботу" title="Субботние 5v5" className="mb-5 min-[720px]:mb-6" />
      <MatchNav />

      {!featured ? (
        <p className="surface-card px-4 py-10 text-center text-sm text-[var(--text-3)]">
          Матчи ещё не запланированы
        </p>
      ) : (
        <div className="space-y-8">
          <MatchCard session={featured} number={numberOf(featured)} userMap={userMap} viewer={user} />

          {rest.length > 0 && (
            <section>
              <h2 className="mb-3 text-[17px] leading-snug min-[720px]:text-[20px]">Прошлые матчи</h2>
              <ul className="surface-card divide-y divide-[var(--border-soft)] overflow-hidden">
                {rest.map((s) => (
                  <li key={s.id}>
                    <PastMatchRow session={s} number={numberOf(s)} userMap={userMap} viewer={user} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function matchData(session: SessionWithGames, userMap: Record<string, UserRow>, viewer: Viewer) {
  const radiant = parseJsonArray(session.radiantPlayerIds);
  const dire = parseJsonArray(session.direPlayerIds);
  const named = (ids: string[]) =>
    ids.map((id) => ({
      id,
      firstName: userMap[id]?.firstName,
      lastName: userMap[id]?.lastName,
      username: userMap[id]?.username,
      finalRating: userMap[id]?.profile?.finalRating ?? 0,
    }));
  const radiantName = teamDisplayName(named(radiant), "Team A");
  const direName = teamDisplayName(named(dire), "Team B");
  const { radiantWins, direWins } = seriesScoreByGame1Roster(session);
  const hasG2 = Object.keys(parseTeamAssignments(session.teamAssignmentsGame2)).length > 0;
  const maxReplayGame = session.replays.reduce((m, r) => Math.max(m, r.gameNumber), 0);
  const gameCount = Math.max(session.games.length, hasG2 ? 2 : 1, maxReplayGame, 1);

  const games: MatchGameView[] = Array.from({ length: gameCount }, (_, i) => {
    const gameNumber = i + 1;
    const recorded = session.games.find((g) => g.gameNumber === gameNumber);
    const L = lineupsForGame(session, gameNumber);
    const rep = session.replays.find((r) => r.gameNumber === gameNumber);
    const repData = rep ? ((rep.data as unknown as ReplayData) ?? null) : null;
    const rName = teamDisplayName(named(L.radiantIds), "Team A");
    const dName = teamDisplayName(named(L.direIds), "Team B");
    return {
      gameNumber,
      radiantName: rName,
      direName: dName,
      radiant: L.radiant,
      dire: L.dire,
      radiantPower: sumPower(L.radiantIds, userMap),
      direPower: sumPower(L.direIds, userMap),
      radiantPoints: recorded ? sumPoints(recorded.participants, L.radiantIds) : 0,
      direPoints: recorded ? sumPoints(recorded.participants, L.direIds) : 0,
      winnerTeam: recorded?.winnerTeam ?? null,
      replay: rep
        ? {
            gameNumber,
            durationSec: rep.durationSec,
            radiantWin: rep.radiantWin,
            radiantScore: rep.radiantScore,
            direScore: rep.direScore,
            players: repData?.players ?? [],
            draft: repData?.draft ?? [],
          }
        : null,
    };
  });

  return {
    radiant,
    dire,
    radiantName,
    direName,
    radiantWins,
    direWins,
    games,
    myTeam: radiant.includes(viewer.id) ? "RADIANT" : dire.includes(viewer.id) ? "DIRE" : null,
    lineupsVisible:
      (session.status === "LINEUPS_CONFIRMED" ||
        session.status === "IN_PROGRESS" ||
        session.status === "COMPLETED") &&
      (radiant.length > 0 || dire.length > 0),
  };
}

function MatchCard({
  session,
  number,
  userMap,
  viewer,
  embedded = false,
}: {
  session: SessionWithGames;
  number: number;
  userMap: Record<string, UserRow>;
  viewer: Viewer;
  embedded?: boolean;
}) {
  const d = matchData(session, userMap, viewer);
  const mvp = session.mvpResolved && session.mvpWinnerId ? userMap[session.mvpWinnerId] : null;
  const live = session.status === "IN_PROGRESS";

  return (
    <article className={cn(!embedded && "surface-card overflow-hidden")}>
      {!embedded && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-soft)] px-4 py-3 min-[720px]:px-6">
          <div className="min-w-0">
            <p className="eyebrow">Матч #{number}</p>
            <p className="text-[15px] font-semibold text-[var(--text)]">{formatShortDateTime(session.date)}</p>
          </div>
          <Badge variant={live ? "points" : session.status === "COMPLETED" ? "default" : "power"}>
            {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--points)]" aria-hidden />}
            {MATCH_STATUS_LABELS[session.status]}
          </Badge>
        </header>
      )}

      {(d.myTeam && d.lineupsVisible) || mvp ? (
        <div className="flex flex-wrap gap-2 px-4 pt-4 min-[720px]:px-6">
          {d.myTeam && d.lineupsVisible && (
            <Badge variant="points">Твоя команда: {d.myTeam === "RADIANT" ? d.radiantName : d.direName}</Badge>
          )}
          {mvp && (
            <Badge variant="warning">
              <Star className="h-3 w-3 fill-current" aria-hidden />
              MVP дня: {displayName(mvp)}
            </Badge>
          )}
        </div>
      ) : null}

      {d.lineupsVisible && (
        <MatchGameBoard
          seriesRadiantIds={d.radiant}
          seriesDireIds={d.dire}
          seriesRadiantWins={d.radiantWins}
          seriesDireWins={d.direWins}
          games={d.games}
          userMap={userMap}
          viewer={viewer}
          mvpId={session.mvpWinnerId}
        />
      )}

      {session.status === "TEAMS_SET" && (d.radiant.length > 0 || d.dire.length > 0) && (
        <div className="px-4 py-4 min-[720px]:px-6">
          <p className="mb-3 text-sm text-[var(--text-3)]">
            Игроки набраны. Составы ещё не утверждены — команды и позиции скрыты.
          </p>
          <ol className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {[...d.radiant, ...d.dire].map((id, i) => (
              <li key={id} className="flex items-center gap-2">
                <span className="w-5 text-right font-mono-num text-[12px] text-[var(--text-3)]">{i + 1}</span>
                {userMap[id] ? <PlayerLink user={userMap[id]} viewer={viewer} avatar={24} /> : id}
              </li>
            ))}
          </ol>
        </div>
      )}

      {session.status === "PLANNED" && !d.lineupsVisible && (
        <p className="px-4 py-5 text-sm text-[var(--text-3)] min-[720px]:px-6">
          {session.mode === "OPEN_SIGNUP" && "Запись идёт в Telegram-боте. "}
          Составы появятся здесь, когда тренер их утвердит.
        </p>
      )}

      {(session.status === "COMPLETED" || session.mvpResolved) &&
        (d.radiant.includes(viewer.id) || d.dire.includes(viewer.id)) && (
          <div className="border-t border-[var(--border-soft)] px-4 py-4 min-[720px]:px-6">
            <MatchMvpClient
              sessionId={session.id}
              nominees={[...d.radiant, ...d.dire]
                .filter((id) => id !== viewer.id)
                .map((id) => userMap[id])
                .filter(Boolean)
                .map((u) => ({
                  id: u.id,
                  firstName: u.firstName,
                  lastName: u.lastName,
                  username: u.username,
                }))}
            />
          </div>
        )}
    </article>
  );
}

function PastMatchRow({
  session,
  number,
  userMap,
  viewer,
}: {
  session: SessionWithGames;
  number: number;
  userMap: Record<string, UserRow>;
  viewer: Viewer;
}) {
  const d = matchData(session, userMap, viewer);
  const hasGames = session.games.length > 0;
  const winner = !hasGames
    ? null
    : d.radiantWins > d.direWins
      ? { name: d.radiantName, side: "radiant" as const }
      : d.direWins > d.radiantWins
        ? { name: d.direName, side: "dire" as const }
        : { name: "Ничья", side: null };
  const myResult =
    d.myTeam && winner?.side
      ? (winner.side === "radiant") === (d.myTeam === "RADIANT")
        ? "W"
        : "L"
      : null;

  return (
    <details className="group">
      <summary className="flex min-h-[56px] cursor-pointer list-none items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--surface-muted)] min-[720px]:px-6 [&::-webkit-details-marker]:hidden">
        <span className="w-9 shrink-0 font-mono-num text-[12px] text-[var(--text-3)]">#{number}</span>
        <span className="w-14 shrink-0 text-[13px] text-[var(--text-2)]">{formatShortDate(session.date)}</span>
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[var(--text)]">
          {winner ? winner.name : MATCH_STATUS_LABELS[session.status]}
        </span>
        {hasGames && (
          <span className="shrink-0 font-mono-num text-[14px] font-bold text-[var(--text)]">
            {d.radiantWins}:{d.direWins}
          </span>
        )}
        {myResult && (
          <span
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[11px] font-bold",
              myResult === "W"
                ? "bg-[var(--success-bg)] text-[var(--success-ink)]"
                : "bg-[var(--danger-bg)] text-[var(--danger)]"
            )}
            title={myResult === "W" ? "Ты выиграл" : "Ты проиграл"}
          >
            {myResult}
          </span>
        )}
        <span
          className="shrink-0 text-[var(--text-3)] transition-transform duration-[200ms] ease-[cubic-bezier(0.23,1,0.32,1)] group-open:rotate-90"
          aria-hidden
        >
          ›
        </span>
      </summary>
      <div className="border-t border-[var(--border-soft)] bg-[var(--surface)]">
        <MatchCard session={session} number={number} userMap={userMap} viewer={viewer} embedded />
      </div>
    </details>
  );
}

function sumPower(ids: string[], userMap: Record<string, UserRow>) {
  return ids.reduce((s, id) => s + (userMap[id]?.profile?.finalRating ?? 0), 0);
}

function sumPoints(
  participants: { userId: string; pointsAwarded: number }[],
  teamIds: string[]
) {
  const set = new Set(teamIds);
  return participants.filter((p) => set.has(p.userId)).reduce((s, p) => s + p.pointsAwarded, 0);
}
