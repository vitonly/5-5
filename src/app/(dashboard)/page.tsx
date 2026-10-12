import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { TopPlayerCard } from "@/components/TopPlayerCard";
import { HomeLiveStreams } from "@/components/HomeLiveStreams";
import { VideoCard } from "@/components/VideoCard";
import { SectionHeader } from "@/components/home/SectionHeader";
import { MotionChip } from "@/components/fx/MotionChip";
import { extractTwitchLogin } from "@/lib/twitch";
import { getActiveSeasonId, getSeasonLeaderboard } from "@/lib/points";
import { SEASON_LABELS } from "@/lib/labels";

export const dynamic = "force-dynamic";


export default async function HomePage() {
  const viewer = await getSessionUser();
  const seasonId = await getActiveSeasonId();

  const [activeSeason, leaderboard, latestVideos, streamMaterials] =
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

  const seasonTitle = activeSeason ? `${SEASON_LABELS[activeSeason.name]} ${activeSeason.year}` : null;

  return (
    <div className="space-y-10 min-[720px]:space-y-14">
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
      </section>

      {/* Медиа */}
      {(streamMaterials.length > 0 || latestVideos.length > 0) && (
        <section className="space-y-10">
          <HomeLiveStreams materialByLogin={materialByLogin} />

          {latestVideos.length > 0 && (
            <div>
              <SectionHeader title="Последние видео" href="/materials" linkLabel="Все материалы" />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {latestVideos.map((v) => (
                  <VideoCard key={v.id} title={v.title} url={v.url} description={v.description} />
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
