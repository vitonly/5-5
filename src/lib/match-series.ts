import { prisma } from "@/lib/db";
import { displayName } from "@/lib/utils";
import { parseParticipantIds } from "@/lib/season-participant-ids";

/**
 * Мини-сезон 5v5 — например, «Игры по сертификатам» на три субботы.
 *
 * Как это работает:
 * - тренер создаёт мини-сезон и выбирает, кто в нём играет;
 * - при рассылке на 5v5 тренер выбирает: обычная игра или игра мини-сезона;
 * - очки за победы, ничьи и MVP в играх мини-сезона идут ТОЛЬКО в его таблицу
 *   (MatchSeriesPoint), общие очки школы не меняются;
 * - прогнозов, зала славы и ачивок в этих играх нет;
 * - когда мини-сезон закончился, тренер его закрывает — 5v5 становится как раньше,
 *   а таблица мини-сезона остаётся в базе.
 */

// Округление до 0.1, как в lib/points.ts (points.ts сам импортирует этот файл, поэтому не наоборот)
const roundPoints = (v: number) => Math.round(v * 10) / 10;

export const DEFAULT_SERIES_NAME = "Игры по сертификатам";

/** Открытый сейчас мини-сезон (он один) */
export function getActiveSeries() {
  return prisma.matchSeries.findFirst({ where: { isActive: true }, orderBy: { createdAt: "desc" } });
}

/** id учеников мини-сезона */
export function seriesParticipantIds(series: { participantIds: string }): string[] {
  return parseParticipantIds(series.participantIds);
}

/**
 * Как назвать игровой день в сообщениях: «5v5» или «5v5 «Игры по сертификатам»».
 * Так ученик сразу видит, на какую игру его зовут.
 */
export async function matchLabel(session: { seriesId?: string | null }): Promise<string> {
  if (!session.seriesId) return "5v5";
  const series = await prisma.matchSeries.findUnique({
    where: { id: session.seriesId },
    select: { name: true },
  });
  return series ? `5v5 «${series.name}»` : "5v5";
}

/** Мини-сезон дня по id сессии (или null, если это обычная 5v5) */
export async function seriesIdOfSession(sessionId: string): Promise<string | null> {
  const s = await prisma.matchSession.findUnique({ where: { id: sessionId }, select: { seriesId: true } });
  return s?.seriesId ?? null;
}

/** Начислить очки в таблицу мини-сезона (общие очки школы не трогаем) */
export async function addSeriesPoints(
  seriesId: string,
  userId: string,
  delta: number,
  reason: string,
  source: { type: string; id: string }
) {
  const rounded = roundPoints(delta);
  await prisma.matchSeriesPoint.create({
    data: { seriesId, userId, delta: rounded, reason, sourceType: source.type, sourceId: source.id },
  });
  return rounded;
}

/** Убрать очки мини-сезона за игру/день (при отмене игры или удалении сессии) */
export async function removeSeriesPointsBySource(sourceType: string, sourceId: string) {
  const res = await prisma.matchSeriesPoint.deleteMany({ where: { sourceType, sourceId } });
  return res.count;
}

export type SeriesRow = {
  userId: string;
  name: string;
  points: number;
  wins: number;
  games: number;
  mvp: number;
};

/** Таблица мини-сезона: все участники (даже с нулём), сортировка по очкам */
export async function getSeriesLeaderboard(series: { id: string; participantIds: string }): Promise<SeriesRow[]> {
  const [logs, participants] = await Promise.all([
    prisma.matchSeriesPoint.findMany({ where: { seriesId: series.id } }),
    prisma.matchParticipant.findMany({
      where: { game: { session: { seriesId: series.id } } },
      select: { userId: true, won: true },
    }),
  ]);
  const coaches = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  const coachIds = new Set(coaches.map((c) => c.id));

  // В таблице — выбранные ученики и все, кто реально сыграл (кроме тренера)
  const ids = new Set(seriesParticipantIds(series));
  for (const p of participants) if (!coachIds.has(p.userId)) ids.add(p.userId);

  const users = await prisma.user.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, firstName: true, lastName: true, username: true },
  });

  const rows: SeriesRow[] = users.map((u) => {
    const mine = logs.filter((l) => l.userId === u.id);
    const played = participants.filter((p) => p.userId === u.id);
    return {
      userId: u.id,
      name: displayName(u),
      points: roundPoints(mine.reduce((s, l) => s + l.delta, 0)),
      wins: played.filter((p) => p.won).length,
      games: played.length,
      mvp: mine.filter((l) => l.sourceType === "MATCH_MVP").length,
    };
  });
  return rows.sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name, "ru"));
}
