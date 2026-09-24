import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, requireAdmin } from "@/lib/session";
import { balanceTeams } from "@/lib/team-balance";
import { displayName, parseJsonArray, toJsonArray } from "@/lib/utils";
import {
  applyMatchDrawPoints,
  applyMatchWinPointsForPlayer,
  isOffRole,
  undoMatchGame,
} from "@/lib/points";
import { parseSecondaryRoles } from "@/lib/secondary-roles";
import {
  buildAssignmentsFromLineups,
  validateLineups,
} from "@/lib/match-lineup";
import type { TeamAssignment } from "@/lib/match-lineup";
import { startMatchSession } from "@/lib/match-signup";

function parseAssignments(raw: string): TeamAssignment {
  try {
    return JSON.parse(raw) as TeamAssignment;
  } catch {
    return {};
  }
}

function buildAssignments(teams: ReturnType<typeof balanceTeams>): string {
  const map: TeamAssignment = {};
  for (const p of teams.radiant) {
    map[p.id] = { team: "RADIANT", position: p.position };
  }
  for (const p of teams.dire) {
    map[p.id] = { team: "DIRE", position: p.position };
  }
  return JSON.stringify(map);
}

/**
 * Сколько побед подряд у игрока в ЭТОЙ сессии (этот день), без учёта текущей игры.
 * Ничья или поражение обрывают серию.
 */
async function getSessionWinStreakBefore(sessionId: string, userId: string): Promise<number> {
  const games = await prisma.matchGame.findMany({
    where: { sessionId },
    orderBy: { gameNumber: "asc" },
    include: {
      participants: { where: { userId }, take: 1 },
    },
  });

  let streak = 0;
  for (const game of games) {
    if (game.winnerTeam === "DRAW") {
      streak = 0;
      continue;
    }
    const p = game.participants[0];
    if (!p) {
      streak = 0;
      continue;
    }
    if (p.won) streak += 1;
    else streak = 0;
  }
  return streak;
}

export async function GET() {
  const user = await requireUser();
  const sessions = await prisma.matchSession.findMany({
    include: {
      games: { include: { participants: { include: { user: true } } } },
    },
    orderBy: { date: "desc" },
  });

  return NextResponse.json({ sessions, userId: user.id });
}

export async function POST(request: NextRequest) {
  await requireAdmin();
  const body = await request.json();
  const { date, playerIds } = body;

  if (!date || !playerIds?.length) {
    return NextResponse.json({ error: "Укажите дату и игроков" }, { status: 400 });
  }

  const session = await prisma.matchSession.create({
    data: {
      date: new Date(date),
      status: "PLANNED",
    },
  });

  if (playerIds.length === 10) {
    const profiles = await prisma.playerProfile.findMany({
      where: { userId: { in: playerIds } },
      include: { user: true },
    });

    const players = profiles.map((p) => ({
      id: p.userId,
      name: displayName(p.user),
      finalRating: p.finalRating,
      primaryRole: p.primaryRole,
      secondaryRoles: parseSecondaryRoles(p.secondaryRoles, p.secondaryRole),
    }));

    try {
      const teams = balanceTeams(players);
      const updated = await prisma.matchSession.update({
        where: { id: session.id },
        data: {
          status: "TEAMS_SET",
          radiantPlayerIds: toJsonArray(teams.radiant.map((p) => p.id)),
          direPlayerIds: toJsonArray(teams.dire.map((p) => p.id)),
          teamAssignments: buildAssignments(teams),
        },
      });
      return NextResponse.json({ session: updated, teams });
    } catch {
      return NextResponse.json({ session });
    }
  }

  return NextResponse.json({ session });
}

export async function PATCH(request: NextRequest) {
  await requireAdmin();
  const body = await request.json();
  const { sessionId, winnerTeam, gameNumber, completeSession, undoGameId } = body;

  if (undoGameId) {
    try {
      const game = await undoMatchGame(undoGameId);
      return NextResponse.json({ undone: true, gameId: game.id });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Не удалось отменить" },
        { status: 400 }
      );
    }
  }

  const session = await prisma.matchSession.findUnique({
    where: { id: sessionId },
    include: { games: true },
  });
  if (!session) {
    return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });
  }

  if (completeSession) {
    if (session.status === "COMPLETED") {
      return NextResponse.json({ error: "Сессия уже завершена" }, { status: 400 });
    }
    await prisma.matchSession.update({
      where: { id: sessionId },
      data: { status: "COMPLETED" },
    });
    return NextResponse.json({ session: { id: sessionId, status: "COMPLETED" } });
  }

  if (body.action === "updateTeams") {
    if (session.status === "COMPLETED" || session.status === "IN_PROGRESS") {
      return NextResponse.json(
        { error: "Сессия начата или завершена — состав нельзя менять" },
        { status: 400 }
      );
    }
    const radiant = Array.isArray(body.radiant) ? body.radiant : [];
    const dire = Array.isArray(body.dire) ? body.dire : [];
    const normalizedRadiant = radiant.map(
      (s: { userId: string; position: number }) => ({
        userId: String(s.userId),
        position: Number(s.position),
      })
    );
    const normalizedDire = dire.map((s: { userId: string; position: number }) => ({
      userId: String(s.userId),
      position: Number(s.position),
    }));

    const err = validateLineups(normalizedRadiant, normalizedDire);
    if (err) {
      return NextResponse.json({ error: err }, { status: 400 });
    }

    const built = buildAssignmentsFromLineups(normalizedRadiant, normalizedDire);
    const updated = await prisma.matchSession.update({
      where: { id: sessionId },
      data: {
        status: "TEAMS_SET",
        radiantPlayerIds: built.radiantPlayerIds,
        direPlayerIds: built.direPlayerIds,
        teamAssignments: built.assignmentsJson,
      },
    });
    return NextResponse.json({ session: updated });
  }

  if (body.action === "startSession") {
    try {
      const updated = await startMatchSession(sessionId);
      return NextResponse.json({ session: updated });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Не удалось стартовать" },
        { status: 400 }
      );
    }
  }

  if (!winnerTeam) {
    return NextResponse.json({ error: "Укажите победителя" }, { status: 400 });
  }

  if (session.status !== "IN_PROGRESS") {
    return NextResponse.json(
      { error: "Сначала нажмите «Старт сессии» (все за ПК)" },
      { status: 400 }
    );
  }

  const radiantIds = parseJsonArray(session.radiantPlayerIds);
  const direIds = parseJsonArray(session.direPlayerIds);
  const allIds = [...radiantIds, ...direIds];
  const nextGameNumber = gameNumber || session.games.length + 1;
  const isDraw = winnerTeam === "DRAW";
  const assignments = parseAssignments(session.teamAssignments);

  // Стрик для +3 — только в рамках этой сессии (одного дня), не между субботами
  const sessionStreakBefore: Record<string, number> = {};
  await Promise.all(
    allIds.map(async (userId) => {
      sessionStreakBefore[userId] = await getSessionWinStreakBefore(sessionId, userId);
    })
  );

  // Снимок профильного стрика до начисления (для отмены)
  const profilesBefore = await prisma.playerProfile.findMany({
    where: { userId: { in: allIds } },
  });
  const streakMap = Object.fromEntries(profilesBefore.map((p) => [p.userId, p.winStreak]));

  const game = await prisma.matchGame.create({
    data: {
      sessionId,
      gameNumber: nextGameNumber,
      winnerTeam,
      participants: {
        create: [
          ...radiantIds.map((userId) => ({
            userId,
            team: "RADIANT",
            won: !isDraw && winnerTeam === "RADIANT",
            prevWinStreak: streakMap[userId] ?? 0,
            pointsAwarded: 0,
          })),
          ...direIds.map((userId) => ({
            userId,
            team: "DIRE",
            won: !isDraw && winnerTeam === "DIRE",
            prevWinStreak: streakMap[userId] ?? 0,
            pointsAwarded: 0,
          })),
        ],
      },
    },
    include: { participants: true },
  });

  if (isDraw) {
    for (const userId of allIds) {
      const delta = await applyMatchDrawPoints(userId, game.id);
      await prisma.matchParticipant.updateMany({
        where: { gameId: game.id, userId },
        data: { pointsAwarded: delta },
      });
      // Ничья обрывает дневную/профильную серию
      await prisma.playerProfile.update({
        where: { userId },
        data: { winStreak: 0 },
      });
    }
    return NextResponse.json({ game });
  }

  const winnerIds = winnerTeam === "RADIANT" ? radiantIds : direIds;
  const loserIds = winnerTeam === "RADIANT" ? direIds : radiantIds;

  const [winnerProfiles, loserProfiles] = await Promise.all([
    prisma.playerProfile.findMany({ where: { userId: { in: winnerIds } } }),
    prisma.playerProfile.findMany({ where: { userId: { in: loserIds } } }),
  ]);

  const winnerAvg =
    winnerProfiles.reduce((sum, p) => sum + p.finalRating, 0) / Math.max(winnerIds.length, 1);
  const loserAvg =
    loserProfiles.reduce((sum, p) => sum + p.finalRating, 0) / Math.max(loserIds.length, 1);

  for (const userId of allIds) {
    const won = winnerIds.includes(userId);
    const profile = await prisma.playerProfile.findUnique({ where: { userId } });
    if (!profile) continue;

    if (won) {
      // +3 только если это 2-я (и далее) победа подряд В ЭТОЙ сессии/день
      const dayWinStreak = (sessionStreakBefore[userId] ?? 0) + 1;
      const position = assignments[userId]?.position ?? 0;
      const offRole = isOffRole(profile.primaryRole, position);
      const delta = await applyMatchWinPointsForPlayer(
        userId,
        dayWinStreak,
        winnerAvg,
        loserAvg,
        offRole,
        game.id
      );
      await prisma.playerProfile.update({
        where: { userId },
        data: { wins: { increment: 1 }, winStreak: dayWinStreak },
      });
      await prisma.matchParticipant.updateMany({
        where: { gameId: game.id, userId },
        data: { pointsAwarded: delta },
      });
    } else {
      await prisma.playerProfile.update({
        where: { userId },
        data: { losses: { increment: 1 }, winStreak: 0 },
      });
    }
  }

  return NextResponse.json({ game });
}
