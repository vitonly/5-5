import type { DotaRole } from "@prisma/client";
import { prisma } from "./db";

export const POINT_VALUES = {
  HOMEWORK_DONE: 0.5,
  HOMEWORK_EXCELLENT: 1,
  HOMEWORK_OVERDUE: -0.5,
  MATCH_WIN: 1,
  /** Вторая победа подряд в тот же игровой день (сумма с первой = 3) */
  MATCH_WIN_STREAK: 2,
  MATCH_DRAW: 1,
  MVP_DAY: 0.5,
  /** Посещение занятия (среда) */
  LESSON_ATTEND: 0.5,
} as const;

/** Множитель к базовым очкам победы по приоритету ролей профиля */
export const ROLE_WIN_MULT = {
  PRIMARY: 1.0,
  SECOND: 1.1,
  THIRD: 1.2,
  OFF: 1.5,
} as const satisfies Record<string, number>;


export type PointCategory = "homework" | "match" | "penalty" | "bonus" | "other";

export function categorizePointReason(reason: string): PointCategory {
  const r = reason.toLowerCase();
  if (r.startsWith("штраф:")) return "penalty";
  if (r.startsWith("бонус:")) return "bonus";
  if (r.includes("домашка")) return "homework";
  if (r.includes("5v5") || r.includes("отмена игры")) return "match";
  if (r.includes("посещение")) return "bonus";
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

/** Удалить начисления по source и откатить totalPoints (для снятия посещаемости и т.п.). */
export async function removePointsBySource(
  userId: string,
  sourceType: string,
  sourceId: string
) {
  const logs = await prisma.pointLog.findMany({
    where: { userId, sourceType, sourceId },
  });
  if (!logs.length) return 0;
  const sum = roundPoints(logs.reduce((s, l) => s + l.delta, 0));
  await prisma.$transaction([
    prisma.pointLog.deleteMany({ where: { userId, sourceType, sourceId } }),
    prisma.playerProfile.update({
      where: { userId },
      data: { totalPoints: { increment: -sum } },
    }),
  ]);
  return sum;
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
    lifetimeGrouped.map((g) => [g.userId, roundPoints(g._sum.delta ?? 0)])
  );

  if (!seasonId) {
    return students
      .filter((u) => u.profile)
      .map((u) => ({
        userId: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        username: u.username,
        totalPoints: roundPoints(u.profile!.totalPoints),
        lifetimePoints: lifetimeByUser[u.id] ?? roundPoints(u.profile!.totalPoints),
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints);
  }

  const grouped = await prisma.pointLog.groupBy({
    by: ["userId"],
    where: { seasonId },
    _sum: { delta: true },
  });
  const byUser = Object.fromEntries(
    grouped.map((g) => [g.userId, roundPoints(g._sum.delta ?? 0)])
  );

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

/**
 * Восстановить profile.totalPoints = сумма PointLog активного сезона.
 * Нужно после ошибочного finalize / «продолжить сезон».
 */
export async function restoreSeasonPointsToProfiles(seasonId: string) {
  const students = await prisma.user.findMany({
    where: { role: "STUDENT" },
    select: { id: true },
  });
  const grouped = await prisma.pointLog.groupBy({
    by: ["userId"],
    where: { seasonId },
    _sum: { delta: true },
  });
  const byUser = Object.fromEntries(
    grouped.map((g) => [g.userId, roundPoints(g._sum.delta ?? 0)])
  );

  await prisma.$transaction(
    students.map((s) =>
      prisma.playerProfile.update({
        where: { userId: s.id },
        data: { totalPoints: byUser[s.id] ?? 0 },
      })
    )
  );
  return students.length;
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

/** Приоритетный список ролей: основная + доп. (до 3 слотов для множителей). */
export function rolePriorityList(
  primaryRole: DotaRole | null | undefined,
  secondaryRoles: DotaRole[] = []
): DotaRole[] {
  const list: DotaRole[] = [];
  if (primaryRole) list.push(primaryRole);
  for (const r of secondaryRoles) {
    if (!list.includes(r)) list.push(r);
    if (list.length >= 3) break;
  }
  return list;
}

/** Множитель 1.0 / 1.1 / 1.2 / 1.5 по позиции в lineup. */
export function roleWinMultiplier(
  primaryRole: DotaRole | null | undefined,
  secondaryRoles: DotaRole[],
  position: number
): { mult: number; label: string } {
  if (!position) {
    return { mult: ROLE_WIN_MULT.PRIMARY, label: "основная роль" };
  }
  const list = rolePriorityList(primaryRole, secondaryRoles);
  for (let i = 0; i < list.length; i++) {
    if (naturalPositions(list[i]).includes(position)) {
      if (i === 0) return { mult: ROLE_WIN_MULT.PRIMARY, label: "основная роль" };
      if (i === 1) return { mult: ROLE_WIN_MULT.SECOND, label: "2-я роль" };
      return { mult: ROLE_WIN_MULT.THIRD, label: "3-я роль" };
    }
  }
  return { mult: ROLE_WIN_MULT.OFF, label: "не на своей роли" };
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
  primaryRole?: DotaRole | null;
  secondaryRoles?: DotaRole[];
  position?: number;
  /** @deprecated используй primaryRole/secondaryRoles/position */
  offRole?: boolean;
}): { delta: number; reason: string } {
  const {
    winStreak,
    winnerAvgRating,
    loserAvgRating,
    primaryRole,
    secondaryRoles = [],
    position = 0,
    offRole,
  } = options;

  const streakBase =
    winStreak >= 2 ? POINT_VALUES.MATCH_WIN_STREAK : POINT_VALUES.MATCH_WIN;
  const parts =
    winStreak >= 2
      ? ["Победа в 5v5 (2 победы подряд за день)"]
      : ["Победа в 5v5"];

  let base: number = streakBase;
  if (winStreak < 2) {
    const upset = upsetMultiplier(winnerAvgRating, loserAvgRating);
    if (upset > 1) {
      base = roundPoints(base * upset);
      parts.push("апсет");
    }
  }

  let roleMult: number = ROLE_WIN_MULT.PRIMARY;
  let roleLabel = "основная роль";
  if (position || primaryRole || secondaryRoles.length) {
    const r = roleWinMultiplier(primaryRole, secondaryRoles, position);
    roleMult = r.mult;
    roleLabel = r.label;
  } else if (offRole) {
    roleMult = ROLE_WIN_MULT.OFF;
    roleLabel = "не на своей роли";
  }

  if (roleMult !== ROLE_WIN_MULT.PRIMARY) {
    parts.push(roleLabel);
  }

  const delta = roundPoints(base * roleMult);
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
  gameId: string,
  opts?: {
    primaryRole?: DotaRole | null;
    secondaryRoles?: DotaRole[];
    position?: number;
    offRole?: boolean;
  }
) {
  const { delta, reason } = calcMatchWinPoints({
    winStreak,
    winnerAvgRating,
    loserAvgRating,
    primaryRole: opts?.primaryRole,
    secondaryRoles: opts?.secondaryRoles,
    position: opts?.position,
    offRole: opts?.offRole,
  });
  await addPoints(userId, delta, reason, { type: "MATCH_GAME", id: gameId });
  return delta;
}

/**
 * Перерасчёт старых начислений за 2-ю победу дня: было +3 (+0.1 офф), стало +2 × roleMult.
 * Корректирует PointLog + totalPoints + MatchParticipant.pointsAwarded.
 */
export async function recalculateStreakWinPoints() {
  const logs = await prisma.pointLog.findMany({
    where: {
      sourceType: "MATCH_GAME",
      reason: { contains: "2 победы подряд" },
    },
  });

  let fixed = 0;
  for (const log of logs) {
    if (!log.sourceId) continue;
    const participant = await prisma.matchParticipant.findFirst({
      where: { gameId: log.sourceId, userId: log.userId, won: true },
      include: {
        game: { include: { session: true } },
        user: { include: { profile: true } },
      },
    });
    if (!participant?.user.profile) continue;

    const session = participant.game.session;
    const assignments = (() => {
      try {
        return JSON.parse(session.teamAssignments || "{}") as Record<
          string,
          { position?: number }
        >;
      } catch {
        return {};
      }
    })();
    const position = assignments[log.userId]?.position ?? 0;
    const secondaryRoles = (() => {
      try {
        const raw = participant.user.profile!.secondaryRoles;
        const parsed = JSON.parse(raw || "[]");
        return Array.isArray(parsed) ? (parsed as DotaRole[]) : [];
      } catch {
        return [] as DotaRole[];
      }
    })();

    const { delta: correct } = calcMatchWinPoints({
      winStreak: 2,
      winnerAvgRating: 50,
      loserAvgRating: 50,
      primaryRole: participant.user.profile.primaryRole,
      secondaryRoles,
      position,
    });

    const old = roundPoints(log.delta);
    if (old === correct) continue;
    const diff = roundPoints(correct - old);

    await prisma.$transaction([
      prisma.pointLog.update({
        where: { id: log.id },
        data: {
          delta: correct,
          reason: calcMatchWinPoints({
            winStreak: 2,
            winnerAvgRating: 50,
            loserAvgRating: 50,
            primaryRole: participant.user.profile.primaryRole,
            secondaryRoles,
            position,
          }).reason,
        },
      }),
      prisma.playerProfile.update({
        where: { userId: log.userId },
        data: { totalPoints: { increment: diff } },
      }),
      prisma.matchParticipant.update({
        where: { id: participant.id },
        data: { pointsAwarded: correct },
      }),
    ]);
    fixed++;
  }
  return fixed;
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
export async function undoMatchGame(
  gameId: string,
  opts?: { allowCompleted?: boolean }
) {
  const game = await prisma.matchGame.findUnique({
    where: { id: gameId },
    include: { participants: true, session: true },
  });
  if (!game) throw new Error("Игра не найдена");
  if (game.session.status === "COMPLETED" && !opts?.allowCompleted) {
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

/** Удалить сессию 5v5 целиком: откат игр (если были) + cascade. */
export async function deleteMatchSession(sessionId: string) {
  const session = await prisma.matchSession.findUnique({
    where: { id: sessionId },
    include: { games: { orderBy: { gameNumber: "desc" } } },
  });
  if (!session) throw new Error("Сессия не найдена");

  for (const game of session.games) {
    await undoMatchGame(game.id, { allowCompleted: true });
  }

  await prisma.matchSession.delete({ where: { id: sessionId } });
  return { id: sessionId };
}
