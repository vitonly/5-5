import { prisma } from "@/lib/db";
import { computeStrengthFromVotes, type VibeValue } from "@/lib/rating";

/** Пересчитать силу игрока по оценкам сезона (или только база, если оценок нет) */
export async function refreshPlayerStrength(userId: string, seasonId?: string | null) {
  const profile = await prisma.playerProfile.findUnique({ where: { userId } });
  if (!profile) return null;

  let sid = seasonId;
  if (!sid) {
    const open = await prisma.ratingSeason.findFirst({ where: { status: "OPEN" } });
    sid = open?.id;
    if (!sid) {
      const latest = await prisma.ratingSeason.findFirst({
        orderBy: [{ year: "desc" }, { createdAt: "desc" }],
      });
      sid = latest?.id;
    }
  }

  let mechanicsScores: number[] = [];
  let macroScores: number[] = [];
  let vibeVotes: VibeValue[] = [];

  if (sid) {
    const [peer, vibes] = await Promise.all([
      prisma.peerRating.findMany({ where: { seasonId: sid, targetId: userId } }),
      prisma.vibeVote.findMany({ where: { seasonId: sid, targetId: userId } }),
    ]);
    mechanicsScores = peer.map((r) => r.mechanics);
    macroScores = peer.map((r) => r.macro);
    vibeVotes = vibes.map((v) => v.value as VibeValue);
  }

  const result = computeStrengthFromVotes({
    rankTier: profile.rankTier,
    mechanicsScores,
    macroScores,
    vibeVotes,
  });

  return prisma.playerProfile.update({
    where: { userId },
    data: {
      skillMod: result.skillMod,
      vibeMod: result.vibeMod,
      finalRating: result.finalRating,
      seasonCoefficient: 1,
    },
  });
}

export async function finalizeSeason(seasonId: string) {
  const students = await prisma.user.findMany({
    where: { role: "STUDENT" },
    select: { id: true },
  });

  for (const student of students) {
    await refreshPlayerStrength(student.id, seasonId);
  }

  return prisma.ratingSeason.update({
    where: { id: seasonId },
    data: { status: "CLOSED", closedAt: new Date() },
  });
}
