import type { DotaRole } from "@prisma/client";
import { prisma } from "./db";

export const POINT_VALUES = {
  HOMEWORK_DONE: 0.5,
  HOMEWORK_EXCELLENT: 1,
  HOMEWORK_OVERDUE: -0.5,
  MATCH_WIN: 1,
  MATCH_WIN_STREAK: 3,
  MATCH_DRAW: 1,
  OFF_ROLE_BONUS: 0.1,
} as const;

export type PointCategory = "homework" | "match" | "penalty" | "bonus" | "other";

export function categorizePointReason(reason: string): PointCategory {
  const r = reason.toLowerCase();
  if (r.startsWith("штраф:")) return "penalty";
  if (r.startsWith("бонус:")) return "bonus";
  if (r.includes("домашка")) return "homework";
  if (r.includes("5v5") || r.includes("отмена игры")) return "match";
  return "other";
}

export const POINT_CATEGORY_LABELS: Record<PointCategory, string> = {
  homework: "Домашки",
  match: "Матчи",
  penalty: "Штрафы",
  bonus: "Бонусы",
  other: "Прочее",
};

export const SEASON_PRIZES = ["Приз за 1 место", "Приз за 2 место", "Приз за 3 место"] as const;

export function roundPoints(value: number): number {
  return Math.round(value * 10) / 10;
}

export function formatPoints(value: number): string {
  const rounded = roundPoints(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export async function getActiveSeasonId(): Promise<string | null> {
  const season = await prisma.ratingSeason.findFirst({ where: { isActive: true } });
  return season?.id ?? null;
}

export async function addPoints(
  userId: string,
  delta: number,
  reason: string,
  source?: { type: string; id: string }
) {
  const rounded = roundPoints(delta);
  const seasonId = await getActiveSeasonId();
  await prisma.$transaction([
    prisma.pointLog.create({
      data: {
        userId,
        delta: rounded,
        reason,
        seasonId,
        sourceType: source?.type ?? null,
        sourceId: source?.id ?? null,
      },
    }),
    prisma.playerProfile.update({
      where: { userId },
      data: { totalPoints: { increment: rounded } },
    }),
  ]);
  return rounded;
}

/** Сезонные очки учеников (сумма PointLog за сезон). Без сезона — текущий totalPoints. */
export async function getSeasonLeaderboard(seasonId: string | null) {
  const students = await prisma.user.findMany({
    where: { role: "STUDENT" },
    include: { profile: true },
  });

  const lifetimeGrouped = await prisma.pointLog.groupBy({
    by: ["userId"],
    _sum: { delta: true },
  });
  const lifetimeByUser = Object.fromEntries(
    lifetimeGrouped.map((g) => [g.userId, g._sum.delta ?? 0])
  );

  if (!seasonId) {
    return students
      .filter((u) => u.profile)
      .map((u) => ({
        userId: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        username: u.username,
        totalPoints: u.profile!.totalPoints,
        lifetimePoints: lifetimeByUser[u.id] ?? u.profile!.totalPoints,
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints);
  }

  const grouped = await prisma.pointLog.groupBy({
    by: ["userId"],
    where: { seasonId },
    _sum: { delta: true },
  });
  const byUser = Object.fromEntries(grouped.map((g) => [g.userId, g._sum.delta ?? 0]));

  return students
    .filter((u) => u.profile)
    .map((u) => ({
      userId: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      username: u.username,
      totalPoints: byUser[u.id] ?? 0,
      lifetimePoints: lifetimeByUser[u.id] ?? 0,
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints);
}

export async function applyHomeworkGradedPoints(
  userId: string,
  excellent: boolean,
  homeworkTitle: string,
  assignmentId?: string
) {
  const delta = excellent ? POINT_VALUES.HOMEWORK_EXCELLENT : POINT_VALUES.HOMEWORK_DONE;
  const reason = excellent
    ? `Домашка «${homeworkTitle}» — отлично выполнена`
    : `Домашка «${homeworkTitle}» — принята`;
  await addPoints(
    userId,
    delta,
    reason,
    assignmentId ? { type: "HOMEWORK", id: assignmentId } : undefined
  );
}

export async function applyHomeworkOverduePenalty(userId: string, homeworkTitle: string) {
  await addPoints(
    userId,
    POINT_VALUES.HOMEWORK_OVERDUE,
    `Домашка «${homeworkTitle}» — не сдана к дедлайну`
  );
}

function naturalPositions(role: DotaRole): number[] {
  switch (role) {
    case "CARRY":
      return [1];
    case "MID":
      return [2];
    case "OFFLANE":
      return [3];
    case "SUPPORT":
    case "HARD_SUPPORT":
      return [4, 5];
    default:
      return [];
  }
}

export function isOffRole(primaryRole: DotaRole | null | undefined, position: number): boolean {
  if (!primaryRole || !position) return false;
  return !naturalPositions(primaryRole).includes(position);
}

function upsetMultiplier(winnerAvg: number, loserAvg: number): number {
  if (loserAvg <= 0 || winnerAvg >= loserAvg) return 1;
  const diff = (loserAvg - winnerAvg) / loserAvg;
  if (diff >= 0.35) return 1.3;
  if (diff >= 0.25) return 1.2;
  if (diff >= 0.15) return 1.1;
  return 1;
}

export function calcMatchWinPoints(options: {
  winStreak: number;
  winnerAvgRating: number;
  loserAvgRating: number;
  offRole: boolean;
}): { delta: number; reason: string } {
  const { winStreak, winnerAvgRating, loserAvgRating, offRole } = options;

  if (winStreak >= 2) {
    let delta: number = POINT_VALUES.MATCH_WIN_STREAK;
    const parts = ["Победа в 5v5 (2 победы подряд за день)"];
    if (offRole) {
      delta = roundPoints(delta + POINT_VALUES.OFF_ROLE_BONUS);
      parts.push("не на своей роли");
    }
    return { delta, reason: parts.join(", ") };
  }

  let delta: number = POINT_VALUES.MATCH_WIN;
  const parts = ["Победа в 5v5"];

  const upset = upsetMultiplier(winnerAvgRating, loserAvgRating);
  if (upset > 1) {
    delta = roundPoints(delta * upset);
    parts.push("апсет");
  }
  if (offRole) {
    delta = roundPoints(delta + POINT_VALUES.OFF_ROLE_BONUS);
    parts.push("не на своей роли");
  }

  return { delta, reason: parts.join(", ") };
}

export async function applyMatchDrawPoints(userId: string, gameId: string) {
  return addPoints(userId, POINT_VALUES.MATCH_DRAW, "Ничья в 5v5", {
    type: "MATCH_GAME",
    id: gameId,
  });
}

export async function applyMatchWinPointsForPlayer(
  userId: string,
  winStreak: number,
  winnerAvgRating: number,
  loserAvgRating: number,
  offRole: boolean,
  gameId: string
) {
  const { delta, reason } = calcMatchWinPoints({
    winStreak,
    winnerAvgRating,
    loserAvgRating,
    offRole,
  });
  await addPoints(userId, delta, reason, { type: "MATCH_GAME", id: gameId });
  return delta;
}

/** Штраф (отрицательный) или бонус (положительный) от админа */
export async function applyAdminAdjustment(
  userId: string,
  amount: number,
  reason: string,
  adminId: string
) {
  const rounded = roundPoints(amount);
  if (rounded === 0) throw new Error("Сумма не может быть 0");
  const seasonId = await getActiveSeasonId();
  const isBonus = rounded > 0;
  const logReason = isBonus ? `Бонус: ${reason}` : `Штраф: ${reason}`;

  await prisma.$transaction([
    prisma.penalty.create({
      data: { targetId: userId, adminId, amount: rounded, reason },
    }),
    prisma.pointLog.create({
      data: {
        userId,
        delta: rounded,
        reason: logReason,
        seasonId,
        sourceType: isBonus ? "BONUS" : "PENALTY",
        sourceId: adminId,
      },
    }),
    prisma.playerProfile.update({
      where: { userId },
      data: { totalPoints: { increment: rounded } },
    }),
  ]);
}

/** @deprecated используй applyAdminAdjustment */
export async function applyPenalty(userId: string, amount: number, reason: string, adminId: string) {
  await applyAdminAdjustment(userId, -Math.abs(amount), reason, adminId);
}

/** Откат очков и статистики за игру 5v5 */
export async function undoMatchGame(gameId: string) {
  const game = await prisma.matchGame.findUnique({
    where: { id: gameId },
    include: { participants: true, session: true },
  });
  if (!game) throw new Error("Игра не найдена");
  if (game.session.status === "COMPLETED") {
    throw new Error("Сессия завершена — отмена недоступна");
  }

  const seasonId = await getActiveSeasonId();

  for (const p of game.participants) {
    const awarded = roundPoints(p.pointsAwarded);
    if (awarded !== 0) {
      await prisma.$transaction([
        prisma.pointLog.create({
          data: {
            userId: p.userId,
            delta: -awarded,
            reason: `Отмена игры ${game.gameNumber} 5v5`,
            seasonId,
            sourceType: "MATCH_UNDO",
            sourceId: gameId,
          },
        }),
        prisma.playerProfile.update({
          where: { userId: p.userId },
          data: { totalPoints: { increment: -awarded } },
        }),
      ]);
    }

    if (game.winnerTeam === "DRAW") {
      // ничья не меняла wins/losses/streak
    } else if (p.won) {
      const profile = await prisma.playerProfile.findUnique({ where: { userId: p.userId } });
      await prisma.playerProfile.update({
        where: { userId: p.userId },
        data: {
          wins: Math.max(0, (profile?.wins ?? 1) - 1),
          winStreak: p.prevWinStreak,
        },
      });
    } else {
      const profile = await prisma.playerProfile.findUnique({ where: { userId: p.userId } });
      await prisma.playerProfile.update({
        where: { userId: p.userId },
        data: {
          losses: Math.max(0, (profile?.losses ?? 1) - 1),
          winStreak: p.prevWinStreak,
        },
      });
    }
  }

  await prisma.matchGame.delete({ where: { id: gameId } });
  return game;
}
