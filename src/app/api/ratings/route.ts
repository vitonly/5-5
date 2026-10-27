import { publicUserSelect } from "@/lib/public-user";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { PLAYER_ROLES } from "@/lib/coach";
import { requireUser, requireAdmin } from "@/lib/session";
import {
  finalizeSeason,
  refreshPlayerStrength,
  resetAllPowerToRankBase,
  recalculateAllPlayerStrengths,
  closeVoting,
  reopenVotingFor24h,
  migrateLegacySeasonDeadlines,
} from "@/lib/seasons";
import { parseAppDateTime } from "@/lib/utils";
import { restoreSeasonPointsToProfiles } from "@/lib/points";
import type { SeasonName, VibeValue } from "@prisma/client";
import { handleAuth } from "@/lib/api-auth";

function clampScore100(n: unknown): number | null {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  const i = Math.round(v);
  if (i < 0 || i > 100) return null;
  return i;
}

const TILT_VALUES = new Set(["STABLE", "UNSURE", "TILT"]);

async function getHandler() {
  const user = await requireUser();
  if (user.role === "ADMIN") {
    await migrateLegacySeasonDeadlines();
  }

  // Ученик видит только свои голоса; тренер — все. Пользователи — только публичные поля.
  const isAdmin = user.role === "ADMIN";
  const seasons = await prisma.ratingSeason.findMany({
    include: {
      peerRatings: {
        where: isAdmin ? undefined : { raterId: user.id },
        include: { rater: { select: publicUserSelect }, target: { select: publicUserSelect } },
      },
      vibeVotes: {
        where: isAdmin ? undefined : { voterId: user.id },
        include: { voter: { select: publicUserSelect }, target: { select: publicUserSelect } },
      },
    },
    orderBy: [{ year: "desc" }, { name: "desc" }],
  });

  // Кого оценивают: ученики и тренер (он тоже играет 5на5)
  const students = await prisma.user.findMany({
    where: { role: { in: PLAYER_ROLES } },
    select: { ...publicUserSelect, profile: isAdmin ? true : { select: { finalRating: true } } },
    orderBy: { firstName: "asc" },
  });

  const openSeason = seasons.find((s) => s.status === "OPEN");
  const activeSeason = seasons.find((s) => s.isActive);

  return NextResponse.json({
    seasons,
    students,
    openSeason,
    activeSeason,
    currentUserId: user.id,
    isAdmin: user.role === "ADMIN",
  });
}

async function postHandler(request: NextRequest) {
  await requireAdmin();
  const body = await request.json();
  const { name, year, closesAt, votingClosesAt } = body as {
    name: SeasonName;
    year: number;
    closesAt?: string;
    votingClosesAt?: string;
  };

  const existing = await prisma.ratingSeason.findUnique({
    where: { name_year: { name, year } },
  });
  if (existing) {
    return NextResponse.json({ error: "Такой сезон уже существует" }, { status: 400 });
  }

  await prisma.ratingSeason.updateMany({
    where: { OR: [{ isActive: true }, { status: "OPEN" }] },
    data: { isActive: false, status: "CLOSED", closedAt: new Date() },
  });

  // Новый сезон стартует с нулевых очков платформы; история — в PointLog прошлых сезонов
  await prisma.playerProfile.updateMany({ data: { totalPoints: 0 } });

  const season = await prisma.ratingSeason.create({
    data: {
      name,
      year,
      status: "OPEN",
      isActive: true,
      openedAt: new Date(),
      closesAt: closesAt ? parseAppDateTime(closesAt) : null,
      votingClosesAt: votingClosesAt ? parseAppDateTime(votingClosesAt) : null,
    },
  });

  return NextResponse.json({ season });
}

async function putHandler(request: NextRequest) {
  const user = await requireUser();
  const body = await request.json();
  const { seasonId, targetId, score, mechanics, macro, vibe, action, closesAt, votingClosesAt } =
    body;

  if (action === "resetPower") {
    await requireAdmin();
    const n = await resetAllPowerToRankBase();
    return NextResponse.json({ ok: true, reset: n });
  }

  if (action === "recalcStrength") {
    await requireAdmin();
    const n = await recalculateAllPlayerStrengths(seasonId ?? null);
    return NextResponse.json({ ok: true, recalculated: n });
  }

  if (action === "closeVoting") {
    await requireAdmin();
    if (!seasonId) {
      return NextResponse.json({ error: "Не указан сезон" }, { status: 400 });
    }
    const season = await closeVoting(seasonId);
    return NextResponse.json({ season });
  }

  if (action === "reopenVoting24h") {
    await requireAdmin();
    if (!seasonId) {
      return NextResponse.json({ error: "Не указан сезон" }, { status: 400 });
    }
    try {
      const season = await reopenVotingFor24h(seasonId);
      return NextResponse.json({ season });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Не удалось открыть голосование" },
        { status: 400 }
      );
    }
  }

  if (action === "close") {
    await requireAdmin();
    const season = await finalizeSeason(seasonId);
    return NextResponse.json({ season });
  }

  if (action === "open" || action === "continue") {
    await requireAdmin();
    // Только один OPEN: иначе голоса уезжают в «не тот» сезон
    await prisma.ratingSeason.updateMany({
      where: { status: "OPEN", id: { not: seasonId } },
      data: { status: "CLOSED", closedAt: new Date() },
    });
    // Не трогаем isActive у других и не сбрасываем очки — продолжение текущего сезона
    const data: {
      status: "OPEN";
      isActive: boolean;
      closedAt: null;
      openedAt?: Date;
      closesAt?: Date | null;
      votingClosesAt?: Date | null;
    } = {
      status: "OPEN",
      isActive: true,
      closedAt: null,
    };
    if (action === "open") {
      data.openedAt = new Date();
    }
    if (closesAt !== undefined) {
      data.closesAt = closesAt ? parseAppDateTime(closesAt) : null;
    }
    if (votingClosesAt !== undefined) {
      data.votingClosesAt = votingClosesAt ? parseAppDateTime(votingClosesAt) : null;
    }
    await prisma.ratingSeason.updateMany({
      where: { id: { not: seasonId }, isActive: true },
      data: { isActive: false },
    });
    const season = await prisma.ratingSeason.update({
      where: { id: seasonId },
      data,
    });
    // После ошибочного закрытия со сбросом — вернуть totalPoints из лога сезона
    if (action === "continue") {
      await restoreSeasonPointsToProfiles(seasonId);
    }
    return NextResponse.json({ season });
  }

  if (action === "activate") {
    await requireAdmin();
    await prisma.ratingSeason.updateMany({ data: { isActive: false } });
    const season = await prisma.ratingSeason.update({
      where: { id: seasonId },
      data: { isActive: true },
    });
    await restoreSeasonPointsToProfiles(seasonId);
    return NextResponse.json({ season });
  }

  if (action === "setDeadline" || action === "setDeadlines") {
    await requireAdmin();
    const data: { closesAt?: Date | null; votingClosesAt?: Date | null } = {};
    if (closesAt !== undefined) {
      data.closesAt = closesAt ? parseAppDateTime(closesAt) : null;
    }
    if (votingClosesAt !== undefined) {
      data.votingClosesAt = votingClosesAt ? parseAppDateTime(votingClosesAt) : null;
    }
    const season = await prisma.ratingSeason.update({
      where: { id: seasonId },
      data,
    });
    return NextResponse.json({ season });
  }

  if (action === "delete") {
    await requireAdmin();
    if (!seasonId) {
      return NextResponse.json({ error: "Не указан сезон" }, { status: 400 });
    }
    const existing = await prisma.ratingSeason.findUnique({ where: { id: seasonId } });
    if (!existing) {
      return NextResponse.json({ error: "Сезон не найден" }, { status: 404 });
    }
    // PeerRating/VibeVote — cascade; PointLog.seasonId — SetNull (история очков остаётся)
    await prisma.ratingSeason.delete({ where: { id: seasonId } });
    return NextResponse.json({ deleted: true, seasonId });
  }

  const season = await prisma.ratingSeason.findUnique({ where: { id: seasonId } });
  if (!season || season.status !== "OPEN") {
    return NextResponse.json({ error: "Голосование закрыто" }, { status: 400 });
  }

  if (user.id === targetId) {
    return NextResponse.json({ error: "Нельзя оценивать себя" }, { status: 400 });
  }
  // Оценивать можно только игроков 5на5 — учеников и тренера (не выдуманный id)
  const target = typeof targetId === "string"
    ? await prisma.user.findUnique({ where: { id: targetId }, select: { role: true } })
    : null;
  if (!target || !PLAYER_ROLES.includes(target.role as "STUDENT" | "ADMIN")) {
    return NextResponse.json({ error: "Такого игрока нет" }, { status: 400 });
  }

  // Тильт-голос
  if (vibe !== undefined) {
    if (!TILT_VALUES.has(vibe)) {
      return NextResponse.json({ error: "Некорректный тильт" }, { status: 400 });
    }
    const vote = await prisma.vibeVote.upsert({
      where: {
        seasonId_voterId_targetId: { seasonId, voterId: user.id, targetId },
      },
      update: { value: vibe as VibeValue },
      create: {
        seasonId,
        voterId: user.id,
        targetId,
        value: vibe as VibeValue,
      },
    });
    await refreshPlayerStrength(targetId, seasonId);
    return NextResponse.json({ vibeVote: vote });
  }

  // Оценка силы 0–100 (или legacy mechanics+macro → score)
  let skillScore = clampScore100(score);
  if (skillScore === null && mechanics != null && macro != null) {
    const mech = Number(mechanics);
    const mac = Number(macro);
    if (Number.isFinite(mech) && Number.isFinite(mac)) {
      skillScore = Math.round((((mech + mac) / 2 - 1) / 9) * 100);
      skillScore = Math.max(0, Math.min(100, skillScore));
    }
  }
  if (skillScore === null) {
    return NextResponse.json({ error: "Оценка должна быть от 0 до 100" }, { status: 400 });
  }

  const rating = await prisma.peerRating.upsert({
    where: {
      seasonId_raterId_targetId: { seasonId, raterId: user.id, targetId },
    },
    update: { score: skillScore, mechanics: 5, macro: 5, teamplay: 5 },
    create: {
      seasonId,
      raterId: user.id,
      targetId,
      score: skillScore,
      mechanics: 5,
      macro: 5,
      teamplay: 5,
    },
  });

  await refreshPlayerStrength(targetId, seasonId);
  return NextResponse.json({ rating });
}

// Нет входа / нет прав — ответ 401 / 403, а не «ошибка сервера»
export const GET = handleAuth(getHandler);
export const POST = handleAuth(postHandler);
export const PUT = handleAuth(putHandler);
