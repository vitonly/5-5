import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { TopPlayerCard } from "@/components/TopPlayerCard";
import { MobilePodiumList } from "@/components/MobilePodiumList";
import { StreamCard } from "@/components/StreamCard";
import { VideoCard } from "@/components/VideoCard";
import { getLiveStreamsFromMaterials } from "@/lib/materials-live";
import { extractTwitchLogin } from "@/lib/twitch";
import { getActiveSeasonId, getSeasonLeaderboard } from "@/lib/points";
import { SEASON_LABELS } from "@/lib/labels";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const viewer = await getSessionUser();
  const seasonId = await getActiveSeasonId();
  const [activeSeason, leaderboard, latestVideos, live, streamMaterials, openSeason] =
    await Promise.all([
      seasonId ? prisma.ratingSeason.findUnique({ where: { id: seasonId } }) : null,
      getSeasonLeaderboard(seasonId),
      prisma.learningMaterial.findMany({
        where: { type: "VIDEO" },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      getLiveStreamsFromMaterials(),
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
    ]);

  const profiles = await prisma.playerProfile.findMany({
    where: { userId: { in: leaderboard.map((e) => e.userId) } },
    include: { user: true },
  });
  const profileMap = Object.fromEntries(profiles.map((p) => [p.userId, p]));

  let pendingVotes = 0;
  if (viewer?.role === "STUDENT" && openSeason) {
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

  const materialByLogin = Object.fromEntries(
    streamMaterials
      .map((m) => {
        const login = extractTwitchLogin(m.url || m.title || "");
        return login ? [login, m] : null;
      })
      .filter((e): e is [string, (typeof streamMaterials)[0]] => e !== null)
  );

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

  return (
    <div className="space-y-12">
      <div className="text-center">
        <h1>Топ игроков</h1>
        {activeSeason && (
          <p className="mt-2 text-sm text-[var(--text-2)]">
            {SEASON_LABELS[activeSeason.name]} {activeSeason.year} · очки сезона
          </p>
        )}
      </div>

      {/* mobile: list rows */}
      <div className="min-[720px]:hidden">
        <MobilePodiumList players={players.slice(0, 10)} viewer={viewer} />
      </div>

      {/* ≥720: podium */}
      <div className="hidden min-[720px]:flex min-[720px]:flex-row min-[720px]:items-end min-[720px]:justify-center min-[720px]:gap-10 lg:gap-16">
        {players.length === 0 ? (
          <p className="text-center text-[var(--text-2)]">
            Игроки появятся здесь, как только добавятся ученики.
          </p>
        ) : (
          <>
            <div className="pb-2">
              <TopPlayerCard player={top3[1]} rank={2} viewer={viewer} />
            </div>
            <div className="pb-10">
              <TopPlayerCard player={top3[0]} rank={1} viewer={viewer} />
            </div>
            <div>
              <TopPlayerCard player={top3[2]} rank={3} viewer={viewer} />
            </div>
          </>
        )}
      </div>

      {pendingVotes > 0 && (
        <div className="flex flex-col items-start justify-between gap-4 rounded-[var(--radius-card)] border border-[var(--points-border)] bg-[var(--points-bg)] p-5 sm:flex-row sm:items-center">
          <div>
            <p className="font-display text-lg font-semibold text-[var(--points)]">
              Оцени тиммейтов
            </p>
            <p className="text-sm text-[var(--text-2)]">
              Осталось заполнить: {pendingVotes}{" "}
              {pendingVotes === 1 ? "игрок" : "игроков"}
            </p>
          </div>
          <Button asChild>
            <Link href="/match/vote">Перейти к голосованию</Link>
          </Button>
        </div>
      )}

      {(live.liveStreams.length > 0 || latestVideos.length > 0) && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2>Обучающие материалы</h2>
            <Link
              href="/materials"
              className="text-sm font-medium text-[var(--points)] hover:underline"
            >
              Все материалы →
            </Link>
          </div>

          {live.liveStreams.length > 0 && (
            <section>
              <h3 className="mb-3 text-[var(--danger)]">Сейчас в эфире</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {live.liveStreams.map((s) => {
                  const material = materialByLogin[s.login.toLowerCase()];
                  if (!material) return null;
                  return (
                    <StreamCard
                      key={s.login}
                      material={material}
                      login={s.login}
                      live={s}
                    />
                  );
                })}
              </div>
            </section>
          )}

          {latestVideos.length > 0 && (
            <section>
              <h3 className="mb-3">Последние видео</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {latestVideos.map((v) => (
                  <VideoCard key={v.id} title={v.title} url={v.url} description={v.description} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
