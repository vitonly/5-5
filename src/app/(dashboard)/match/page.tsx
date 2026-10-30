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
import { heroInfo, type ReplayData } from "@/lib/replay";
import { DotaImg } from "@/components/match/DotaImg";
import { PredictionPanel } from "@/components/match/PredictionPanel";
import { getPredictionView } from "@/lib/match-predictions";
import { getDaySummary } from "@/lib/match-summary";
import { MatchDayTabs } from "@/components/match/MatchDayTabs";
import { DaySummaryView } from "@/components/match/DaySummaryView";
import { PageHeader } from "@/components/ui/page-header";
import { teamDisplayName } from "@/lib/team-names";
import { parseTeamAssignments } from "@/lib/match-lineup";
import { lineupsForGame, seriesScoreByGame1Roster } from "@/lib/match-score";
import { parsePowerSnapshot } from "@/lib/match-power-snapshot";
import { getActiveSeries, getSeriesLeaderboard } from "@/lib/match-series";
import { SeriesTable } from "@/components/match/SeriesTable";

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
      predictions: { select: { userId: true } },
      series: { select: { name: true } },   // игра мини-сезона — подпишем её
    },
    orderBy: { date: "desc" },
    take: 10,
  });
}

export default async function MatchPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string; game?: string }>;
}) {
  const { open, game } = await searchParams;
  const openGame = Number(game) || undefined;
  const user = await getSessionUser();
  if (!user) return null;

  const [sessions, series] = await Promise.all([loadSessions(), getActiveSeries()]);
  // Мини-сезон («Игры по сертификатам») — пока идёт, показываем его таблицу
  const seriesTable = series ? await getSeriesLeaderboard(series) : [];

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
          ...s.predictions.map((p) => p.userId),
          ...(s.mvpWinnerId ? [s.mvpWinnerId] : []),
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

  // Наверху — все незавершённые дни (в субботу может быть и обычная 5v5, и игра мини-сезона)
  // (по одному незавершённому дню каждого вида — старые незакрытые не копятся наверху)
  const upcoming = [
    sessions.find((s) => s.status !== "COMPLETED" && !s.seriesId),
    sessions.find((s) => s.status !== "COMPLETED" && s.seriesId),
  ]
    .filter((s): s is SessionWithGames => Boolean(s))
    .sort((a, b) => +new Date(b.date) - +new Date(a.date));
  const featuredList = upcoming.length ? upcoming : sessions.slice(0, 1);
  const featured = featuredList[0];
  const rest = sessions.filter((s) => !featuredList.includes(s));
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
          {featuredList.map((f) => (
            <MatchCard key={f.id} session={f} number={numberOf(f)} userMap={userMap} viewer={user} initialGame={open === f.id ? openGame : undefined} />
          ))}

          {series && (
            <section>
              <h2 className="mb-1 text-[17px] leading-snug min-[720px]:text-[20px]">Мини-сезон «{series.name}»</h2>
              <p className="mb-3 text-[13px] text-[var(--text-3)]">
                Отдельная таблица: очки за эти игры не идут в общие очки школы.
              </p>
              <SeriesTable rows={seriesTable} viewerId={user.id} />
            </section>
          )}

          {rest.length > 0 && (
            <section>
              <h2 className="mb-3 text-[17px] leading-snug min-[720px]:text-[20px]">Прошлые матчи</h2>
              <ul className="surface-card divide-y divide-[var(--border-soft)] overflow-hidden">
                {rest.map((s) => (
                  <li key={s.id} id={`m-${s.id}`} className="scroll-mt-28">
                    <PastMatchRow
                      session={s}
                      number={numberOf(s)}
                      userMap={userMap}
                      viewer={user}
                      defaultOpen={open === s.id}
                      initialGame={open === s.id ? openGame : undefined}
                    />
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

/**
 * Игроки с силой, замороженной для этой сессии при сборке составов (lib/match-power.ts):
 * сумма силы, «Team <сильнейший>» и счёт серии не меняются, если кто-то поменял ранг посреди дня
 */
function withFrozenPower(userMap: Record<string, UserRow>, snapshotRaw: string | null | undefined) {
  const frozen = parsePowerSnapshot(snapshotRaw);
  const ids = Object.keys(frozen);
  if (!ids.length) return userMap;
  const out = { ...userMap };
  for (const id of ids) {
    const u = out[id];
    if (u) out[id] = { ...u, profile: { ...(u.profile ?? {}), finalRating: frozen[id] } };
  }
  return out;
}

function matchData(session: SessionWithGames, allUserMap: Record<string, UserRow>, viewer: Viewer) {
  const userMap = withFrozenPower(allUserMap, session.powerSnapshot);
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
  const ratingById = Object.fromEntries(
    Object.entries(userMap).map(([id, u]) => [id, u.profile?.finalRating ?? 0])
  );
  const { radiantWins, direWins } = seriesScoreByGame1Roster(session, ratingById);
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
            source: repData?.source ?? "demo",
            screenshots: repData?.screenshots ?? [],
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

async function MatchCard({
  session,
  number,
  userMap: allUserMap,
  viewer,
  embedded = false,
  initialGame,
}: {
  session: SessionWithGames;
  number: number;
  userMap: Record<string, UserRow>;
  viewer: Viewer;
  embedded?: boolean;
  initialGame?: number;
}) {
  // Сила этой сессии — замороженная (см. withFrozenPower)
  const userMap = withFrozenPower(allUserMap, session.powerSnapshot);
  const d = matchData(session, userMap, viewer);
  const mvp = session.mvpResolved && session.mvpWinnerId ? userMap[session.mvpWinnerId] : null;
  const live = session.status === "IN_PROGRESS";
  const prediction = d.lineupsVisible
    ? await getPredictionView(session, viewer.id, { showCounts: viewer.role === "ADMIN" })
    : null;
  const summary = d.lineupsVisible ? await getDaySummary(session) : null;

  return (
    <article className={cn(!embedded && "surface-card overflow-hidden")}>
      {!embedded && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-soft)] px-4 py-3 min-[720px]:px-6">
          <div className="min-w-0">
            <p className="eyebrow">
              Матч #{number}
              {session.series && <span className="text-[var(--points-ink)]"> · {session.series.name}</span>}
            </p>
            <p className="text-[15px] font-semibold text-[var(--text)]">{formatShortDateTime(session.date)}</p>
          </div>
          {/* Синий (power) — только для чисел силы; статусы матча — бирюза или нейтральный */}
          <Badge variant={live ? "points" : session.status === "LINEUPS_CONFIRMED" ? "success" : "default"}>
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

      {summary ? (
        <MatchDayTabs
          gamesCount={session.games.length}
          initial={initialGame ? "games" : "summary"}
          summary={
            <DaySummaryView
              sessionId={session.id}
              summary={summary}
              score={{ leftName: d.radiantName, rightName: d.direName, left: d.radiantWins, right: d.direWins }}
              userMap={userMap}
              viewer={viewer}
            />
          }
          games={
            <>
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
                        initialGame={initialGame}
                      />
                    )}

                    {prediction && (
                      <PredictionPanel sessionId={session.id} view={prediction} canVote={viewer.role === "STUDENT"} />
                    )}
            </>
          }
        />
      ) : (
        <>
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
            initialGame={initialGame}
          />
        )}

        {prediction && (
          <PredictionPanel sessionId={session.id} view={prediction} canVote={viewer.role === "STUDENT"} />
        )}
        </>
      )}

      {session.status === "TEAMS_SET" && (d.radiant.length > 0 || d.dire.length > 0) && (
        <div className="px-4 py-4 min-[720px]:px-6">
          <p className="mb-3 text-sm text-[var(--text-3)]">
            Игроки набраны. Составы ещё не утверждены — команды и позиции скрыты.
          </p>
          {/* Порядок по имени, не radiant→dire: иначе «фейковые» команды видны до утверждения */}
          <ol className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {[...d.radiant, ...d.dire]
              .slice()
              .sort((a, b) => {
                const na = userMap[a] ? displayName(userMap[a]) : a;
                const nb = userMap[b] ? displayName(userMap[b]) : b;
                return na.localeCompare(nb, "ru");
              })
              .map((id, i) => (
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
  defaultOpen = false,
  initialGame,
}: {
  session: SessionWithGames;
  number: number;
  userMap: Record<string, UserRow>;
  viewer: Viewer;
  defaultOpen?: boolean;
  initialGame?: number;
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

  const myHeroes = session.replays
    .map((r) => {
      const me = ((r.data as unknown as ReplayData)?.players ?? []).find((p) => p.userId === viewer.id);
      return me?.heroId != null ? { game: r.gameNumber, heroId: me.heroId } : null;
    })
    .filter((x): x is { game: number; heroId: number } => x !== null);

  return (
    <details className="group" open={defaultOpen || undefined}>
      <summary className="flex min-h-[56px] cursor-pointer list-none items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--surface-muted)] min-[720px]:px-6 [&::-webkit-details-marker]:hidden">
        {/* Номер матча на телефоне скрыт — место отдаём названию победителя */}
        <span className="hidden w-9 shrink-0 font-mono-num text-[12px] text-[var(--text-3)] min-[480px]:inline">#{number}</span>
        <span className="w-14 shrink-0 text-[13px] text-[var(--text-2)]">{formatShortDate(session.date)}</span>
        <span className="min-w-0 flex-1 line-clamp-2 break-words text-[14px] font-semibold leading-snug text-[var(--text)]">
          {winner ? winner.name : MATCH_STATUS_LABELS[session.status]}
          {session.series && (
            <span className="block text-[12px] font-normal text-[var(--points-ink)]">{session.series.name}</span>
          )}
        </span>
        {myHeroes.length > 0 && (
          <span className="hidden shrink-0 items-center gap-1 min-[400px]:flex" title="Твои герои">
            {myHeroes.map((h) => (
              <DotaImg key={h.game} src={heroInfo(h.heroId).img} alt={heroInfo(h.heroId).name} className="h-[20px] w-[35px] rounded-[3px] object-cover" />
            ))}
          </span>
        )}
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
        <MatchCard session={session} number={number} userMap={userMap} viewer={viewer} embedded initialGame={initialGame} />
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
