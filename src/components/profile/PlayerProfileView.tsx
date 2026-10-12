import Link from "next/link";
import { notFound } from "next/navigation";
import { ViewTransition } from "react";
import { prisma } from "@/lib/db";
import { PlayerCard } from "@/components/PlayerCard";
import { RatingBreakdown } from "@/components/RatingBreakdown";
import { PointHistory } from "@/components/PointHistory";
import { WeeklyPointsChart } from "@/components/WeeklyPointsChart";
import { SchoolPointsTile } from "@/components/SchoolPointsTile";
import { MatchHistory, buildMatchHistoryEntries } from "@/components/MatchHistory";
import { ProgressClient } from "@/components/ProgressClient";
import { ProfileForm } from "@/components/ProfileForm";
import { TelegramConnect } from "@/components/TelegramConnect";
import { ProfileTabs, type ProfileTab } from "@/components/profile/ProfileTabs";
import { CountUp } from "@/components/fx/CountUp";
import { TiltCard } from "@/components/fx/TiltCard";
import { MotionChip } from "@/components/fx/MotionChip";
import { SHIELD_CLIP } from "@/lib/fx";
import { DOTA_ROLE_LABELS, SEASON_LABELS, rankLabel } from "@/lib/labels";
import { parseSecondaryRoles } from "@/lib/secondary-roles";
import { displayName } from "@/lib/utils";
import { getActiveSeasonId, getSeasonLeaderboard } from "@/lib/points";
import { getVotingSeason } from "@/lib/seasons";
import { ensureTelegramLinkToken, isTelegramLinked } from "@/lib/telegram-links";
import type { VibeValue } from "@/lib/rating";
import type { User, PlayerProfile } from "@prisma/client";

type Viewer = (User & { profile: PlayerProfile | null }) | null;

function Fact({ label, children, note }: { label: string; children: React.ReactNode; note?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="text-[13px] text-[var(--text-3)]">{label}</dt>
      <dd className="text-right">
        <span className="font-mono-num text-[15px] font-semibold text-[var(--text)]">{children}</span>
        {note && <span className="block text-[11px] text-[var(--text-3)]">{note}</span>}
      </dd>
    </div>
  );
}

/**
 * Профиль игрока в духе инфобокса Liquipedia: карточка + ключевые факты, ниже вкладки.
 * Используется и для своего профиля (/profile, + вкладка «Настройки»), и для чужого (/player/[id]).
 */
export async function PlayerProfileView({
  userId,
  viewer,
  initialTab,
}: {
  userId: string;
  viewer: Viewer;
  initialTab?: string;
}) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
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
      include: { game: { include: { session: true } } },
      take: 80,
    }),
    prisma.user.count({ where: { role: "STUDENT" } }),
  ]);

  const historyPlayerIds = new Set<string>();
  for (const part of matchParts) {
    for (const blob of [part.game.session.teamAssignments, part.game.session.teamAssignmentsGame2]) {
      try {
        const assignments = JSON.parse(blob || "{}") as Record<string, unknown>;
        for (const id of Object.keys(assignments)) historyPlayerIds.add(id);
      } catch {
        /* ignore */
      }
    }
  }
  const historyPlayers =
    historyPlayerIds.size > 0
      ? await prisma.user.findMany({
          where: { id: { in: [...historyPlayerIds] } },
          include: { profile: { select: { finalRating: true } } },
        })
      : [];
  const historyPlayerMap = Object.fromEntries(
    historyPlayers.map((u) => [
      u.id,
      {
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        username: u.username,
        finalRating: u.profile?.finalRating ?? 0,
      },
    ])
  );
  const matchHistory = buildMatchHistoryEntries(user.id, matchParts, historyPlayerMap);
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
        prisma.peerRating.count({ where: { seasonId: ratingSeason.id, raterId: user.id } }),
        prisma.vibeVote.count({ where: { seasonId: ratingSeason.id, voterId: user.id } }),
      ])
    : [[], [], 0, 0];

  const profile = user.profile;
  const secondaryRoles = parseSecondaryRoles(profile.secondaryRoles, profile.secondaryRole);
  const isOwn = viewer?.id === user.id;
  const isAdmin = viewer?.role === "ADMIN";
  const canSeePower = isOwn || isAdmin;

  const placeIdx = leaderboard.findIndex((e) => e.userId === user.id);
  const place = placeIdx >= 0 ? placeIdx + 1 : null;
  const seasonPoints = placeIdx >= 0 ? leaderboard[placeIdx].totalPoints : profile.totalPoints;
  const matchesPlayed = profile.wins + profile.losses;
  const winrate = matchesPlayed > 0 ? Math.round((profile.wins / matchesPlayed) * 100) : null;
  const steamLink = profile.steamAccountId
    ? `https://www.opendota.com/players/${profile.steamAccountId}`
    : null;
  const seasonLabel = ratingSeason ? `${SEASON_LABELS[ratingSeason.name]} ${ratingSeason.year}` : null;

  const roleLine = [
    profile.primaryRole ? DOTA_ROLE_LABELS[profile.primaryRole] : null,
    secondaryRoles.length > 0 ? secondaryRoles.map((r) => DOTA_ROLE_LABELS[r]).join(", ") : null,
  ]
    .filter(Boolean)
    .join(" / ");

  let settings: React.ReactNode = null;
  if (isOwn && viewer) {
    const linkToken = await ensureTelegramLinkToken(viewer.id);
    const botUsername = process.env.NEXT_PUBLIC_BOT_USERNAME || "dota5v5_mygroup_bot";
    settings = (
      <>
        <TelegramConnect linked={isTelegramLinked(viewer)} botUsername={botUsername} linkToken={linkToken} />
        <ProfileForm user={viewer} />
      </>
    );
  }

  const showProgress = (isOwn || isAdmin) && user.role === "STUDENT";

  const tabs: ProfileTab[] = [
    {
      id: "overview",
      label: "Обзор",
      content: (
        <>
          {isOwn && viewer && !isTelegramLinked(viewer) && (
            <Link
              href="?tab=settings"
              className="hover-lift flex items-center justify-between gap-4 rounded-[var(--radius-card)] border border-[var(--points-border)] bg-[var(--points-bg)] p-4"
            >
              <span>
                <span className="block font-display text-[15px] font-semibold text-[var(--points-ink)]">
                  Подключи Telegram
                </span>
                <span className="block text-[13px] text-[var(--text-2)]">
                  Напоминания о домашках, сообщения тренера и запись на 5v5 — в Telegram-боте
                </span>
              </span>
              <span className="text-[var(--points-ink)]" aria-hidden>
                →
              </span>
            </Link>
          )}
          <div className="grid gap-6 lg:grid-cols-2">
            <WeeklyPointsChart logs={logs} />
            <SchoolPointsTile totalPoints={profile.totalPoints} logs={logs} />
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
        </>
      ),
    },
    {
      id: "matches",
      label: "Матчи",
      content: <MatchHistory entries={matchHistory} title={isOwn ? "Мои матчи 5v5" : "История матчей 5v5"} />,
    },
    {
      id: "points",
      label: "Очки",
      content: <PointHistory logs={logs} title={isOwn ? "Моя история очков" : "История очков"} />,
    },
  ];
  if (showProgress) {
    tabs.push({
      id: "progress",
      label: "Прогресс",
      content: <ProgressClient userId={isOwn ? undefined : user.id} readOnly={!isOwn} />,
    });
  }
  if (settings) {
    tabs.push({ id: "settings", label: "Настройки", content: settings });
  }

  return (
    <div className="space-y-6 min-[720px]:space-y-8">
      {/* Инфобокс */}
      <section className="surface-card overflow-hidden">
        <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-x-4 gap-y-4 p-4 min-[720px]:grid-cols-[220px_minmax(0,1fr)] min-[720px]:grid-rows-[auto_1fr] min-[720px]:gap-x-8 min-[720px]:gap-y-5 min-[720px]:p-6">
          <div className="col-start-1 row-start-1 min-[720px]:row-span-2">
            <TiltCard shape={SHIELD_CLIP}>
              <PlayerCard user={user} profile={profile} size={220} />
            </TiltCard>
            <MotionChip className="mt-2 h-7 px-2 text-[11px]" />
          </div>

          <div className="col-start-2 row-start-1 min-w-0 self-start pt-1 min-[720px]:pt-0">
            <div className="min-[720px]:flex min-[720px]:flex-wrap min-[720px]:items-start min-[720px]:justify-between min-[720px]:gap-4">
              <div className="min-w-0">
                <ViewTransition name={`player-name-${user.id}`} share="morph">
                  <h1 className="text-[22px] leading-tight min-[720px]:text-[36px]">{displayName(user)}</h1>
                </ViewTransition>
                <p className="mt-1 text-[13px] text-[var(--text-2)] min-[720px]:mt-1.5 min-[720px]:text-sm">
                  {rankLabel(profile.rankTier)}
                  {roleLine && (
                    <>
                      <span className="hidden min-[720px]:inline"> · </span>
                      <br className="min-[720px]:hidden" />
                      {roleLine}
                    </>
                  )}
                </p>
              </div>
              <span className="mt-2.5 inline-flex h-7 items-center gap-1.5 rounded-full border border-[var(--points-border)] bg-[var(--points-bg)] px-2.5 text-[var(--points-ink)] min-[720px]:mt-0 min-[720px]:h-9 min-[720px]:gap-2 min-[720px]:px-3.5">
                <span className="inline-block h-[7px] w-[7px] bg-[var(--points)] min-[720px]:h-2 min-[720px]:w-2" style={{ transform: "rotate(45deg)" }} aria-hidden />
                <CountUp value={seasonPoints} className="font-mono-num text-[13px] font-semibold min-[720px]:text-[17px] min-[720px]:font-bold" />
                <span className="text-[11px] font-medium min-[720px]:text-[12px]">
                  очк.<span className="hidden min-[720px]:inline"> в сезоне</span>
                </span>
              </span>
            </div>
          </div>

          <div className="col-span-2 min-w-0 self-start min-[720px]:col-span-1 min-[720px]:col-start-2 min-[720px]:row-start-2">
            <dl className="divide-y divide-[var(--border-soft)] min-[720px]:grid min-[720px]:grid-cols-2 min-[720px]:gap-x-8 min-[720px]:divide-y-0 min-[720px]:[&>div]:border-b min-[720px]:[&>div]:border-[var(--border-soft)]">
              <Fact label="Место в сезоне">{place != null ? <CountUp value={place} prefix="#" /> : "—"}</Fact>
              <Fact label="Матчи 5v5">
                {matchesPlayed}{" "}
                <span className="text-[13px] font-medium">
                  (<span className="text-[var(--success-ink)]">{profile.wins}В</span> /{" "}
                  <span className="text-[var(--danger)]">{profile.losses}П</span>)
                </span>
              </Fact>
              <Fact label="Винрейт">{winrate != null ? <CountUp value={winrate} suffix="%" /> : "—"}</Fact>
              <Fact label="Домашки сдано">
                <CountUp value={homeworkDone} />
              </Fact>
              {canSeePower && (
                <Fact label="Рейтинг силы" note="Видишь только ты и тренер">
                  <span className="text-[var(--power)]">{profile.finalRating}</span>
                </Fact>
              )}
              {steamLink && (
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="text-[13px] text-[var(--text-3)]">Статистика Dota</dt>
                  <dd>
                    <a
                      href={steamLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[14px] font-medium text-[var(--points)] hover:underline"
                    >
                      OpenDota ↗
                    </a>
                  </dd>
                </div>
              )}
            </dl>

            {isOwn && (
              <div className="mt-4">
                <Link
                  href="?tab=settings"
                  className="press inline-flex h-9 items-center rounded-[var(--radius-control)] bg-[var(--control)] px-3 text-[13px] font-medium text-[var(--text)] transition-colors hover:bg-[var(--border-soft)]"
                >
                  Редактировать профиль
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      <ProfileTabs key={initialTab ?? "overview"} tabs={tabs} initial={initialTab} />
    </div>
  );
}
