import { prisma } from "@/lib/db";
import {
  calculateFinalRating,
  computeStrengthFromVotes,
  rankTierToBase,
  type TiltValue,
} from "@/lib/rating";

/**
 * Сезон для голосования и отображения оценок.
 * Приоритет: открытый+активный → открытый → активный → последний.
 */
export async function getVotingSeason() {
  const openActive = await prisma.ratingSeason.findFirst({
    where: { status: "OPEN", isActive: true },
  });
  if (openActive) return openActive;

  const open = await prisma.ratingSeason.findFirst({
    where: { status: "OPEN" },
    orderBy: [{ openedAt: "desc" }, { createdAt: "desc" }],
  });
  if (open) return open;

  const active = await prisma.ratingSeason.findFirst({
    where: { isActive: true },
  });
  if (active) return active;

  return prisma.ratingSeason.findFirst({
    orderBy: [{ year: "desc" }, { createdAt: "desc" }],
  });
}

/** Пересчитать силу игрока по оценкам сезона */
export async function refreshPlayerStrength(userId: string, seasonId?: string | null) {
  const profile = await prisma.playerProfile.findUnique({ where: { userId } });
  if (!profile) return null;

  let sid = seasonId;
  if (!sid) {
    const season = await getVotingSeason();
    sid = season?.id;
  }

  let peerScores: number[] = [];
  let trainerScore: number | null = null;
  let peerTilts: TiltValue[] = [];
  let trainerTilt: TiltValue | null = null;

  if (sid) {
    const [peer, vibes, raters] = await Promise.all([
      prisma.peerRating.findMany({
        where: { seasonId: sid, targetId: userId },
        include: { rater: { select: { id: true, role: true } } },
      }),
      prisma.vibeVote.findMany({
        where: { seasonId: sid, targetId: userId },
        include: { voter: { select: { id: true, role: true } } },
      }),
      prisma.user.findMany({
        where: { role: "ADMIN" },
        select: { id: true },
      }),
    ]);
    const adminIds = new Set(raters.map((a) => a.id));

    for (const r of peer) {
      const score = Math.max(0, Math.min(100, r.score ?? 50));
      if (adminIds.has(r.raterId) || r.rater.role === "ADMIN") {
        trainerScore = score;
      } else {
        peerScores.push(score);
      }
    }

    for (const v of vibes) {
      const val = v.value as TiltValue;
      if (adminIds.has(v.voterId) || v.voter.role === "ADMIN") {
        trainerTilt = val;
      } else {
        peerTilts.push(val);
      }
    }
  }

  const result = computeStrengthFromVotes({
    rankTier: profile.rankTier,
    trainerScore,
    peerScores,
    trainerTilt,
    peerTilts,
  });

  return prisma.playerProfile.update({
    where: { userId },
    data: {
      skillMod: result.skillMod,
      vibeMod: result.tiltMod,
      finalRating: result.finalRating,
      seasonCoefficient: 1,
    },
  });
}

/** Пересчитать skillMod/vibeMod/finalRating у всех учеников по голосам сезона. */
export async function recalculateAllPlayerStrengths(seasonId?: string | null) {
  let sid = seasonId;
  if (!sid) {
    const season = await getVotingSeason();
    sid = season?.id;
  }
  const students = await prisma.user.findMany({
    where: { role: "STUDENT" },
    select: { id: true },
  });
  for (const student of students) {
    await refreshPlayerStrength(student.id, sid);
  }
  return students.length;
}

/** Закрыть голосование: ученики больше не меняют оценки. Очки платформы не трогаем. */
export async function closeVoting(seasonId: string) {
  await recalculateAllPlayerStrengths(seasonId);
  return prisma.ratingSeason.update({
    where: { id: seasonId },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
    },
  });
}

export async function finalizeSeason(seasonId: string) {
  await recalculateAllPlayerStrengths(seasonId);

  await prisma.playerProfile.updateMany({
    data: { totalPoints: 0 },
  });

  return prisma.ratingSeason.update({
    where: { id: seasonId },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      isActive: false,
    },
  });
}

/** Сброс голосов и модов силы → только новая база ранга. */
export async function resetAllPowerToRankBase() {
  await prisma.$transaction([
    prisma.peerRating.deleteMany({}),
    prisma.vibeVote.deleteMany({}),
  ]);

  const profiles = await prisma.playerProfile.findMany({
    select: { id: true, rankTier: true },
  });

  await prisma.$transaction(
    profiles.map((p) => {
      const base = rankTierToBase(p.rankTier);
      return prisma.playerProfile.update({
        where: { id: p.id },
        data: {
          skillMod: 0,
          vibeMod: 0,
          finalRating: calculateFinalRating(base, 0, 0),
        },
      });
    })
  );

  return profiles.length;
}

/** После смены таблицы базы ранга — обновить finalRating у всех (skill/vibe моды без изменений). */
export async function syncAllFinalRatingsFromRankBase() {
  const profiles = await prisma.playerProfile.findMany({
    select: { id: true, rankTier: true, skillMod: true, vibeMod: true, finalRating: true },
  });

  const stale = profiles
    .map((p) => {
      const next = calculateFinalRating(
        rankTierToBase(p.rankTier),
        p.skillMod,
        p.vibeMod
      );
      return next !== p.finalRating ? { id: p.id, finalRating: next } : null;
    })
    .filter((x): x is { id: string; finalRating: number } => Boolean(x));

  if (!stale.length) return 0;

  await prisma.$transaction(
    stale.map((p) =>
      prisma.playerProfile.update({
        where: { id: p.id },
        data: { finalRating: p.finalRating },
      })
    )
  );
  return stale.length;
}
