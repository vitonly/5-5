import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { TopPlayerCard } from "@/components/TopPlayerCard";
import { HomeLiveStreams } from "@/components/HomeLiveStreams";
import { VideoCard } from "@/components/VideoCard";
import { SectionHeader } from "@/components/home/SectionHeader";
import { LastMatchCard } from "@/components/home/LastMatchCard";
import { teamDisplayName } from "@/lib/team-names";
import { seriesScoreByGame1Roster } from "@/lib/match-score";
import { hasGame2Lineup } from "@/lib/match-predictions";
import { parseJsonArray } from "@/lib/utils";
import { MotionChip } from "@/components/fx/MotionChip";
import { extractTwitchLogin } from "@/lib/twitch";
import { getActiveSeasonId, getSeasonLeaderboard } from "@/lib/points";
import { SEASON_LABELS } from "@/lib/labels";
import { nextOccurrence, occurrenceLabel, slotsLabel } from "@/lib/schedule";
import { CalendarDays } from "lucide-react";

export const dynamic = "force-dynamic";


export default async function HomePage() {
  const viewer = await getSessionUser();
  const seasonId = await getActiveSeasonId();

  const [activeSeason, leaderboard, latestVideos, streamMaterials, lastSession] =
    await Promise.all([
      seasonId ? prisma.ratingSeason.findUnique({ where: { id: seasonId } }) : null,
      getSeasonLeaderboard(seasonId),
      prisma.learningMaterial.findMany({
        where: { type: "VIDEO" },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      prisma.learningMaterial.findMany({
        where: { type: "STREAM" },
      }),
      // Показываем последний завершённый день, даже если MVP ещё не определён
      prisma.matchSession.findFirst({
        where: { status: "COMPLETED", games: { some: {} } },
        orderBy: { date: "desc" },
        include: {
          games: { select: { gameNumber: true, winnerTeam: true }, orderBy: { gameNumber: "asc" } },
          predictions: { select: { userId: true, gameNumber: true, pick: true } },
          mvpVotes: { select: { nomineeId: true } },
        },
      }),
    ]);

  const profiles = await prisma.playerProfile.findMany({
    where: { userId: { in: leaderboard.map((e) => e.userId) } },
    include: { user: true },
  });
  const profileMap = Object.fromEntries(profiles.map((p) => [p.userId, p]));

  /* --- эфиры --- */
  const materialByLogin = Object.fromEntries(
    streamMaterials
      .map((m) => {
        const login = extractTwitchLogin(m.url || m.title || "");
        return login ? [login, m] : null;
      })
      .filter((e): e is [string, (typeof streamMaterials)[0]] => e !== null)
  );

  /* --- рейтинг --- */
  const players = leaderboard
    .map((e) => {
      const p = profileMap[e.userId];
      if (!p) return null;
      return {
        id: e.userId,
        firstName: e.firstName,
        lastName: e.lastName,
        username: e.username,
        photoUrl: p.user.photoUrl,
        finalRating: p.finalRating,
        rankTier: p.rankTier,
        seasonCoefficient: p.seasonCoefficient,
        mmr: p.mmr,
        primaryRole: p.primaryRole,
        wins: p.wins,
        losses: p.losses,
        totalPoints: e.totalPoints,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const withPoints = players.filter((p) => p.totalPoints > 0);
  const top3 = [withPoints[0] ?? null, withPoints[1] ?? null, withPoints[2] ?? null];

  /* --- итоги последнего 5v5 (MVP опционален) --- */
  let lastMatch: React.ComponentProps<typeof LastMatchCard> | null = null;
  if (lastSession) {
    const radiant = parseJsonArray(lastSession.radiantPlayerIds);
    const dire = parseJsonArray(lastSession.direPlayerIds);
    const predIds = [...new Set(lastSession.predictions.map((p) => p.userId))];
    const voteNomineeIds = [...new Set(lastSession.mvpVotes.map((v) => v.nomineeId))];
    const people = await prisma.user.findMany({
      where: {
        id: {
          in: [
            ...radiant,
            ...dire,
            ...(lastSession.mvpWinnerId ? [lastSession.mvpWinnerId] : []),
            ...predIds,
            ...voteNomineeIds,
          ],
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        photoUrl: true,
        profile: { select: { finalRating: true } },
      },
    });
    const byId = Object.fromEntries(people.map((p) => [p.id, p]));
    const named = (ids: string[]) =>
      ids.map((id) => ({ ...byId[id], id, finalRating: byId[id]?.profile?.finalRating ?? 0 }));
    const ratingById = Object.fromEntries(
      people.map((p) => [p.id, p.profile?.finalRating ?? 0])
    );
    const { radiantWins, direWins } = seriesScoreByGame1Roster(lastSession, ratingById);
    const mvpId =
      lastSession.mvpResolved && lastSession.mvpWinnerId ? lastSession.mvpWinnerId : null;
    const mvp = mvpId ? byId[mvpId] ?? null : null;
    const mvpSide = mvpId
      ? radiant.includes(mvpId)
        ? "RADIANT"
        : dire.includes(mvpId)
          ? "DIRE"
          : null
      : null;

    /** Ничья за 1-е место — только когда голосование уже закрыто без победителя. */
    let mvpTied: (typeof people)[number][] | undefined;
    if (!mvp && lastSession.mvpResolved && lastSession.mvpVotes.length > 0) {
      const counts = new Map<string, number>();
      for (const v of lastSession.mvpVotes) {
        counts.set(v.nomineeId, (counts.get(v.nomineeId) ?? 0) + 1);
      }
      let best = 0;
      let leaders: string[] = [];
      for (const [id, n] of counts) {
        if (n > best) {
          best = n;
          leaders = [id];
        } else if (n === best) {
          leaders.push(id);
        }
      }
      if (best > 0 && leaders.length >= 2) {
        mvpTied = leaders
          .map((id) => byId[id])
          .filter((u): u is NonNullable<typeof u> => Boolean(u));
      }
    }

    const games = hasGame2Lineup(lastSession) ? [1, 2] : [1];
    const predUsers = [...new Set(lastSession.predictions.map((p) => p.userId))];
    const correctPredictors = predUsers
      .filter((uid) =>
        games.every((g) => {
          const pr = lastSession.predictions.find((p) => p.userId === uid && p.gameNumber === g);
          const res = lastSession.games.find((x) => x.gameNumber === g);
          return pr && res && res.winnerTeam === pr.pick;
        })
      )
      .map((id) => byId[id])
      .filter((u): u is NonNullable<typeof u> => Boolean(u));

    lastMatch = {
      sessionId: lastSession.id,
      date: lastSession.date,
      radiantName: teamDisplayName(named(radiant), "Team A"),
      direName: teamDisplayName(named(dire), "Team B"),
      radiantWins,
      direWins,
      mvp,
      mvpTeamWon:
        mvp && mvpSide && radiantWins !== direWins
          ? (mvpSide === "RADIANT") === radiantWins > direWins
          : null,
      mvpTied,
      correctPredictors,
    };
  }

  const seasonTitle = activeSeason ? `${SEASON_LABELS[activeSeason.name]} ${activeSeason.year}` : null;

  // Расписание ученика: его группы и ближайшее занятие (у тренера карточки нет)
  const myGroups =
    viewer?.role === "STUDENT"
      ? await prisma.studentGroup.findMany({
          where: { members: { some: { id: viewer.id } } },
          include: { schedule: true },
        })
      : [];
  const myLessons = myGroups
    .map((g) => ({ name: g.name, at: nextOccurrence(g.schedule), slots: slotsLabel(g.schedule) }))
    .filter((x): x is { name: string; at: Date; slots: string } => x.at !== null)
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  return (
    <div className="space-y-10 min-[720px]:space-y-14">
      {/* Ближайшее занятие ученика по расписанию его групп */}
      {myLessons.length > 0 && (
        <section aria-label="Ближайшее занятие" className="surface-card flex items-start gap-3 p-4 min-[720px]:p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--points-bg)] text-[var(--points)]">
            <CalendarDays className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="eyebrow">Ближайшее занятие</p>
            <p className="mt-1 text-[17px] font-semibold text-[var(--text)]">
              {occurrenceLabel(myLessons[0].at)} · {myLessons[0].name}
            </p>
            <p className="mt-1 text-sm text-[var(--text-3)]">
              {myLessons.map((l) => `${l.name}: ${l.slots}`).join(" · ")}
            </p>
          </div>
        </section>
      )}

      {/* Подиум */}
      <section aria-labelledby="top-title">
        <div className="mb-6 text-center min-[720px]:mb-10">
          {seasonTitle && <p className="eyebrow mb-2">{seasonTitle} · очки сезона</p>}
          <h1 id="top-title" className="min-[720px]:text-[44px] min-[720px]:leading-[50px] min-[720px]:tracking-[-0.02em]">
            Топ игроков
          </h1>
        </div>

        {players.length === 0 ? (
          <p className="surface-card px-4 py-10 text-center text-sm text-[var(--text-2)]">
            Игроки появятся здесь, как только добавятся ученики.
          </p>
        ) : (
          <div className="flex items-end justify-center gap-2.5 min-[400px]:gap-3.5 min-[720px]:gap-10 xl:gap-14">
            <div className="pb-1.5 min-[720px]:pb-2">
              <TopPlayerCard player={top3[1]} rank={2} viewer={viewer} />
            </div>
            <div className="pb-5 min-[720px]:pb-10">
              <TopPlayerCard player={top3[0]} rank={1} viewer={viewer} />
            </div>
            <div>
              <TopPlayerCard player={top3[2]} rank={3} viewer={viewer} />
            </div>
          </div>
        )}
        <div className="mt-4 flex justify-center empty:hidden">
          <MotionChip />
        </div>
        {/* На главной — только пьедестал; вся таблица в «Статистике» */}
        {players.length > 0 && (
          <div className="mt-4 flex justify-center">
            <Link href="/stats" className="press inline-flex min-h-10 items-center gap-1 rounded-full px-3 text-[14px] font-medium text-[var(--points)] hover:bg-[var(--points-bg)]">
              Вся таблица очков <span aria-hidden>→</span>
            </Link>
          </div>
        )}
      </section>

      {lastMatch && <LastMatchCard {...lastMatch} />}

      {/* Медиа */}
      {(streamMaterials.length > 0 || latestVideos.length > 0) && (
        <section className="space-y-10">
          <HomeLiveStreams materialByLogin={materialByLogin} />

          {latestVideos.length > 0 && (
            <div>
              <SectionHeader title="Последние видео" href="/materials" linkLabel="Все материалы" />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {latestVideos.map((v) => (
                  <VideoCard key={v.id} title={v.title} url={v.url} description={v.description} materialId={v.id} />
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
