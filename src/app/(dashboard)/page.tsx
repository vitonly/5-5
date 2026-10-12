import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { TopPlayerCard } from "@/components/TopPlayerCard";
import { HomeLiveStreams } from "@/components/HomeLiveStreams";
import { VideoCard } from "@/components/VideoCard";
import { SectionHeader } from "@/components/home/SectionHeader";
import { MotionChip } from "@/components/fx/MotionChip";
import { NextMatchCard } from "@/components/home/NextMatchCard";
import { TodoCard, homeworkTodo, type TodoItem } from "@/components/home/TodoCard";
import { extractTwitchLogin } from "@/lib/twitch";
import { getActiveSeasonId, getSeasonLeaderboard } from "@/lib/points";
import { SEASON_LABELS } from "@/lib/labels";
import { parseJsonArray } from "@/lib/utils";

export const dynamic = "force-dynamic";

const UPCOMING_STATUSES = ["PLANNED", "TEAMS_SET", "LINEUPS_CONFIRMED", "IN_PROGRESS"] as const;

export default async function HomePage() {
  const viewer = await getSessionUser();
  const seasonId = await getActiveSeasonId();
  const isStudent = viewer?.role === "STUDENT";

  const [activeSeason, leaderboard, latestVideos, streamMaterials, openSeason, nextSession, myHomework] =
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
      prisma.ratingSeason.findFirst({
        where: { status: "OPEN" },
        include: {
          peerRatings: viewer
            ? { where: { raterId: viewer.id }, select: { targetId: true } }
            : false,
          vibeVotes: viewer
            ? { where: { voterId: viewer.id }, select: { targetId: true } }
            : false,
        },
      }),
      prisma.matchSession.findFirst({
        where: { status: { in: [...UPCOMING_STATUSES] } },
        orderBy: { date: "asc" },
        include: { rsvps: { select: { userId: true, status: true } } },
      }),
      isStudent && viewer
        ? prisma.homeworkAssignment.findMany({
            where: { studentId: viewer.id, status: { in: ["OVERDUE", "REVISION", "ASSIGNED"] } },
            include: { homework: { select: { title: true } } },
            orderBy: { deadline: "asc" },
            take: 4,
          })
        : Promise.resolve([]),
    ]);

  const profiles = await prisma.playerProfile.findMany({
    where: { userId: { in: leaderboard.map((e) => e.userId) } },
    include: { user: true },
  });
  const profileMap = Object.fromEntries(profiles.map((p) => [p.userId, p]));

  /* --- голосование --- */
  let pendingVotes = 0;
  if (isStudent && viewer && openSeason) {
    const students = await prisma.user.findMany({
      where: { role: "STUDENT", id: { not: viewer.id } },
      select: { id: true },
    });
    const skillDone = new Set(
      (openSeason.peerRatings as { targetId: string }[] | undefined)?.map((r) => r.targetId) ?? []
    );
    const vibeDone = new Set(
      (openSeason.vibeVotes as { targetId: string }[] | undefined)?.map((v) => v.targetId) ?? []
    );
    for (const s of students) {
      if (!skillDone.has(s.id) || !vibeDone.has(s.id)) pendingVotes++;
    }
  }

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

  /* --- ближайший матч --- */
  let nextMatch: Parameters<typeof NextMatchCard>[0]["match"] = null;
  if (nextSession) {
    const lineup = [
      ...parseJsonArray(nextSession.radiantPlayerIds),
      ...parseJsonArray(nextSession.direPlayerIds),
    ];
    const joined = nextSession.rsvps.filter((r) => r.status === "JOINED").length;
    const mine = viewer ? nextSession.rsvps.find((r) => r.userId === viewer.id) : undefined;
    nextMatch = {
      date: nextSession.date,
      status: nextSession.status,
      players: Math.max(lineup.length, joined),
      capacity: 10,
      myState:
        viewer && lineup.includes(viewer.id)
          ? "lineup"
          : mine?.status === "JOINED"
            ? "joined"
            : mine?.status === "QUEUED"
              ? "queued"
              : mine?.status === "INVITED"
                ? "invited"
                : mine?.status === "DECLINED"
                  ? "declined"
                  : null,
    };
  }

  /* --- дела --- */
  const todos: TodoItem[] = myHomework.map(homeworkTodo);
  if (pendingVotes > 0) {
    todos.unshift({
      key: "votes",
      href: "/match/vote",
      title: "Оцени тиммейтов",
      meta: `Осталось: ${pendingVotes} ${pendingVotes === 1 ? "игрок" : "игроков"}`,
      tone: "warning",
    });
  }

  const seasonTitle = activeSeason ? `${SEASON_LABELS[activeSeason.name]} ${activeSeason.year}` : null;

  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-8 lg:grid-cols-[minmax(0,1fr)_340px] min-[720px]:gap-y-10">
      {/* Подиум */}
      <section className="lg:col-start-1 lg:row-start-1" aria-labelledby="top-title">
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
          <div className="flex items-end justify-center gap-2.5 min-[400px]:gap-3.5 min-[720px]:gap-8 xl:gap-12">
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
      </section>

      {/* Сайдбар: матч и дела (на телефоне — сразу под подиумом) */}
      <aside className="space-y-4 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
        <NextMatchCard match={nextMatch} />
        {isStudent && <TodoCard items={todos} />}
      </aside>

      {/* Медиа */}
      {(streamMaterials.length > 0 || latestVideos.length > 0) && (
        <section className="space-y-6 lg:col-start-1 lg:row-start-2">
          <HomeLiveStreams materialByLogin={materialByLogin} />

          {latestVideos.length > 0 && (
            <div>
              <SectionHeader title="Новые видео" href="/materials" linkLabel="Все материалы" />
              <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-3">
                {latestVideos.map((v) => (
                  <div key={v.id} className="w-[78%] shrink-0 snap-start sm:w-auto">
                    <VideoCard title={v.title} url={v.url} description={v.description} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
