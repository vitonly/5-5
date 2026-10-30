import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/session";
import { handleAuth } from "@/lib/api-auth";
import {
  DEFAULT_SERIES_NAME,
  getActiveSeries,
  getSeriesLeaderboard,
  seriesParticipantIds,
} from "@/lib/match-series";

/**
 * Мини-сезон 5v5 («Игры по сертификатам»).
 * GET — открытый мини-сезон и его таблица; POST — создать; PATCH — участники / название / закрыть.
 */

/** Оставить только существующих учеников (тренера в список не кладём — он может играть всегда) */
async function cleanStudentIds(raw: unknown): Promise<string[]> {
  const ids = Array.isArray(raw) ? [...new Set(raw.map(String))] : [];
  if (!ids.length) return [];
  const students = await prisma.user.findMany({
    where: { id: { in: ids }, role: "STUDENT" },
    select: { id: true },
  });
  return students.map((s) => s.id);
}

function cleanName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim().slice(0, 60) : "";
  return name || DEFAULT_SERIES_NAME;
}

async function getHandler() {
  await requireUser();
  const series = await getActiveSeries();
  if (!series) return NextResponse.json({ series: null, table: [] });
  return NextResponse.json({
    series: { id: series.id, name: series.name, participantIds: seriesParticipantIds(series) },
    table: await getSeriesLeaderboard(series),
  });
}

async function postHandler(request: NextRequest) {
  await requireAdmin();
  const body = await request.json().catch(() => ({}));
  if (await getActiveSeries()) {
    return NextResponse.json({ error: "Мини-сезон уже идёт — сначала закройте его" }, { status: 400 });
  }
  const participantIds = await cleanStudentIds(body.participantIds);
  if (!participantIds.length) {
    return NextResponse.json({ error: "Выберите учеников мини-сезона" }, { status: 400 });
  }
  const series = await prisma.matchSeries.create({
    data: { name: cleanName(body.name), participantIds: JSON.stringify(participantIds) },
  });
  return NextResponse.json({ series });
}

async function patchHandler(request: NextRequest) {
  await requireAdmin();
  const body = await request.json().catch(() => ({}));
  const series = await getActiveSeries();
  if (!series || series.id !== body.seriesId) {
    return NextResponse.json({ error: "Мини-сезон не найден или уже закрыт" }, { status: 404 });
  }

  if (body.action === "setParticipants") {
    const participantIds = await cleanStudentIds(body.participantIds);
    if (!participantIds.length) {
      return NextResponse.json({ error: "Выберите хотя бы одного ученика" }, { status: 400 });
    }
    const updated = await prisma.matchSeries.update({
      where: { id: series.id },
      data: { participantIds: JSON.stringify(participantIds) },
    });
    return NextResponse.json({ series: updated });
  }

  if (body.action === "rename") {
    const updated = await prisma.matchSeries.update({
      where: { id: series.id },
      data: { name: cleanName(body.name) },
    });
    return NextResponse.json({ series: updated });
  }

  if (body.action === "close") {
    // Нельзя закрыть, пока игровой день мини-сезона не доигран — иначе очки уйдут «в никуда»
    const unfinished = await prisma.matchSession.count({
      where: { seriesId: series.id, status: { not: "COMPLETED" } },
    });
    if (unfinished) {
      return NextResponse.json(
        { error: "Сначала завершите или удалите незаконченные игры мини-сезона" },
        { status: 400 }
      );
    }
    // Закрываем, но ничего не удаляем: таблица и игры остаются в базе
    const updated = await prisma.matchSeries.update({
      where: { id: series.id },
      data: { isActive: false, closedAt: new Date() },
    });
    return NextResponse.json({ series: updated });
  }

  return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
}

export const GET = handleAuth(getHandler);
export const POST = handleAuth(postHandler);
export const PATCH = handleAuth(patchHandler);
