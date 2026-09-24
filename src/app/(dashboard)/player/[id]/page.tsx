import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { PlayerCard } from "@/components/PlayerCard";
import { RatingBreakdown } from "@/components/RatingBreakdown";
import { PointHistory } from "@/components/PointHistory";
import { WeeklyPointsChart, MetricTile } from "@/components/WeeklyPointsChart";
import { PointsPill } from "@/components/StatPills";
import { MatchHistory, buildMatchHistoryEntries } from "@/components/MatchHistory";
import { DOTA_ROLE_LABELS, SEASON_LABELS, rankLabel } from "@/lib/labels";
import { parseSecondaryRoles } from "@/lib/secondary-roles";
import { displayName } from "@/lib/utils";
import { getActiveSeasonId, getSeasonLeaderboard } from "@/lib/points";
import { getVotingSeason } from "@/lib/seasons";
import type { VibeValue } from "@/lib/rating";

export const dynamic = "force-dynamic";

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getSessionUser();

  const user = await prisma.user.findUnique({
    where: { id },
    include: { profile: true },
  });

  if (!user?.profile) notFound();

  const seasonId = await getActiveSeasonId();
  const ratingSeason = await getVotingSeason();

  const [logs, homeworkDone, leaderboard, matchParts, studentsCount] = await Promise.all([
    prisma.pointLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.homeworkAssignment.count({
      where: { studentId: user.id, status: "GRADED" },
    }),
    getSeasonLeaderboard(seasonId),
    prisma.matchParticipant.findMany({
      where: { userId: user.id },
      include: {
        game: {
          include: { session: true },
        },
      },
      take: 80,
    }),
    prisma.user.count({ where: { role: "STUDENT" } }),
  ]);

  const matchHistory = buildMatchHistoryEntries(user.id, matchParts);
  const expectedVotes = Math.max(studentsCount - 1, 0);

  const [received, vibes, givenSkill, givenVibe] = ratingSeason
    ? await Promise.all([
        prisma.peerRating.findMany({
          where: { seasonId: ratingSeason.id, targetId: user.id },
          include: { rater: true },
        }),
        prisma.vibeVote.findMany({
          where: { seasonId: ratingSeason.id, targetId: user.id },
          include: { voter: true },
        }),
        prisma.peerRating.count({
          where: { seasonId: ratingSeason.id, raterId: user.id },
        }),
        prisma.vibeVote.count({
          where: { seasonId: ratingSeason.id, voterId: user.id },
        }),
      ])
    : [[], [], 0, 0];

  const profile = user.profile;
  const secondaryRoles = parseSecondaryRoles(profile.secondaryRoles, profile.secondaryRole);
  const isOwnProfile = viewer?.id === user.id;
  const canSeePower = isOwnProfile || viewer?.role === "ADMIN";
  const historyTitle = isOwnProfile ? "Моя история очков" : "История очков";

  const placeIdx = leaderboard.findIndex((e) => e.userId === user.id);
  const place = placeIdx >= 0 ? placeIdx + 1 : null;
  const matchesPlayed = profile.wins + profile.losses;
  const winrate =
    matchesPlayed > 0 ? Math.round((profile.wins / matchesPlayed) * 100) : null;
  const steamLink = profile.steamAccountId
    ? `https://www.opendota.com/players/${profile.steamAccountId}`
    : null;

  const seasonLabel = ratingSeason
    ? `${SEASON_LABELS[ratingSeason.name]} ${ratingSeason.year}`
    : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{displayName(user)}</h1>
          <p className="mt-1 text-sm text-[var(--text-2)]">
            {rankLabel(profile.rankTier)}
            {profile.primaryRole && ` · ${DOTA_ROLE_LABELS[profile.primaryRole]}`}
            {secondaryRoles.length > 0 &&
              ` / ${secondaryRoles.map((r) => DOTA_ROLE_LABELS[r]).join(", ")}`}
            {steamLink && (
              <>
                {" · "}
                <a
                  href={steamLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--points)] underline"
                >
                  OpenDota
                </a>
              </>
            )}
          </p>
        </div>
        {isOwnProfile && viewer?.role === "STUDENT" && (
          <Link
            href="/profile"
            className="rounded-[var(--radius-control)] bg-[var(--points)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--points-hover)]"
          >
            Редактировать профиль
          </Link>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          <PlayerCard user={user} profile={profile} />
          <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-[var(--points-border)] bg-[var(--points-bg)] px-4 py-3">
            <span className="text-sm text-[var(--text-2)]">Очки платформы</span>
            <PointsPill value={profile.totalPoints} />
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricTile label="Место" value={place != null ? `#${place}` : "—"} hint="В сезоне" />
            <MetricTile
              label="Матчи"
              value={matchesPlayed}
              hint={`${profile.wins}В / ${profile.losses}П`}
            />
            <MetricTile
              label="Винрейт"
              value={winrate != null ? `${winrate}%` : "—"}
            />
            <MetricTile
              label="Домашки"
              value={homeworkDone}
              hint="Сдано и принято"
            />
          </div>

          <WeeklyPointsChart logs={logs} />
        </div>
      </div>

      {canSeePower && (
        <RatingBreakdown
          profile={profile}
          received={received}
          vibes={vibes.map((v) => ({ voter: v.voter, value: v.value as VibeValue }))}
          viewer={viewer}
          seasonLabel={seasonLabel}
          givenSkill={givenSkill}
          givenVibe={givenVibe}
          expectedVotes={expectedVotes}
        />
      )}

      <MatchHistory
        entries={matchHistory}
        title={isOwnProfile ? "Мои матчи 5v5" : "История матчей 5v5"}
      />

      <PointHistory logs={logs} title={historyTitle} />
    </div>
  );
}
