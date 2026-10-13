import { prisma } from "@/lib/db";
import { getActiveSeasonId, getSeasonLeaderboard, roundPoints } from "@/lib/points";
import { APP_TIMEZONE, parseAppDateTime } from "@/lib/utils";

function moscowDayKey(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Снимок силы и места всех учеников на сегодня (cron раз в сутки) */
export async function snapshotRatings() {
  const seasonId = await getActiveSeasonId();
  const [students, leaderboard] = await Promise.all([
    prisma.user.findMany({
      where: { role: "STUDENT" },
      select: { id: true, profile: { select: { finalRating: true } } },
    }),
    getSeasonLeaderboard(seasonId),
  ]);
  const placeBy = new Map(leaderboard.map((e, i) => [e.userId, { place: i + 1, points: e.totalPoints }]));
  const date = parseAppDateTime(moscowDayKey());

  let written = 0;
  for (const s of students) {
    if (!s.profile) continue;
    const p = placeBy.get(s.id);
    await prisma.ratingSnapshot.upsert({
      where: { userId_date: { userId: s.id, date } },
      create: {
        userId: s.id,
        date,
        finalRating: s.profile.finalRating,
        place: seasonId ? (p?.place ?? null) : null,
        points: p?.points ?? 0,
      },
      update: {
        finalRating: s.profile.finalRating,
        place: seasonId ? (p?.place ?? null) : null,
        points: p?.points ?? 0,
      },
    });
    written++;
  }
  return written;
}

export type HistoryPoint = { label: string; value: number };

/**
 * Место в активном сезоне по неделям — считается из истории начислений,
 * поэтому работает сразу, без накопленных снимков.
 */
export async function getSeasonPlaceHistory(userId: string): Promise<{ points: HistoryPoint[]; total: number }> {
  const season = await prisma.ratingSeason.findFirst({ where: { isActive: true } });
  if (!season) return { points: [], total: 0 };

  const [logs, students] = await Promise.all([
    prisma.pointLog.findMany({
      where: { seasonId: season.id },
      select: { userId: true, delta: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findMany({ where: { role: "STUDENT", profile: { isNot: null } }, select: { id: true } }),
  ]);
  if (!logs.length) return { points: [], total: students.length };

  const start = season.openedAt ?? logs[0].createdAt;
  const weekMs = 7 * 86_400_000;
  const now = Date.now();
  const sums = new Map<string, number>(students.map((s) => [s.id, 0]));
  const points: HistoryPoint[] = [];
  let i = 0;
  for (let t = start.getTime() + weekMs; ; t += weekMs) {
    const end = Math.min(t, now);
    while (i < logs.length && logs[i].createdAt.getTime() <= end) {
      const l = logs[i++];
      sums.set(l.userId, roundPoints((sums.get(l.userId) ?? 0) + l.delta));
    }
    const mine = sums.get(userId) ?? 0;
    const place = 1 + [...sums.values()].filter((v) => v > mine).length;
    points.push({
      label: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: APP_TIMEZONE })
        .format(new Date(end))
        .replace(".", ""),
      value: place,
    });
    if (end >= now) break;
  }
  return { points: points.slice(-12), total: students.length };
}

/** Сила по неделям из ежедневных снимков (последний снимок каждой недели) */
export async function getPowerHistory(userId: string): Promise<HistoryPoint[]> {
  const snaps = await prisma.ratingSnapshot.findMany({
    where: { userId },
    orderBy: { date: "asc" },
    select: { date: true, finalRating: true },
  });
  const byWeek = new Map<string, { date: Date; value: number }>();
  for (const s of snaps) {
    const d = new Date(s.date);
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    byWeek.set(monday.toISOString().slice(0, 10), { date: d, value: s.finalRating });
  }
  return [...byWeek.values()].slice(-12).map((w) => ({
    label: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: APP_TIMEZONE })
      .format(w.date)
      .replace(".", ""),
    value: w.value,
  }));
}
