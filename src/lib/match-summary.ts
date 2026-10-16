import { cache } from "react";
import { prisma } from "@/lib/db";
import { getSeasonHall, nominationByCode, type HallRecord } from "@/lib/hall-of-fame";
import { hasGame2Lineup } from "@/lib/match-predictions";
import { formatK, type ReplayData, type ReplayPlayer } from "@/lib/replay";

/* «Итоги дня» завершённого матча 5v5 */

type SessionForSummary = {
  id: string;
  status: string;
  mvpWinnerId: string | null;
  teamAssignmentsGame2: string | null;
  games: { gameNumber: number; winnerTeam: string; participants: { userId: string; pointsAwarded: number }[] }[];
  replays: { gameNumber: number; data: unknown }[];
};

export type DayAward = {
  key: string;
  title: string;
  userId: string;
  heroId: number | null;
  gameNumber: number;
  display: string;
};

export type DaySummary = {
  mvp: { userId: string; votes: number; heroIds: number[]; points: number } | null;
  awards: DayAward[];
  hall: (HallRecord & { anti: boolean })[];
  predictions: { total: number; correctUserIds: string[] } | null;
  topPoints: { userId: string; points: number }[];
};

const seasonHall = cache(getSeasonHall);

export async function getDaySummary(session: SessionForSummary): Promise<DaySummary | null> {
  if (session.status !== "COMPLETED" || session.games.length === 0) return null;

  // Очки за матч по участникам
  const pointsBy = new Map<string, number>();
  for (const g of session.games)
    for (const p of g.participants) pointsBy.set(p.userId, (pointsBy.get(p.userId) ?? 0) + p.pointsAwarded);
  const topPoints = [...pointsBy.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([userId, points]) => ({ userId, points: Math.round(points * 10) / 10 }));

  // Игроки из демок
  const rows: { p: ReplayPlayer; game: number }[] = [];
  for (const r of session.replays) {
    for (const p of (r.data as ReplayData | null)?.players ?? []) if (p.userId) rows.push({ p, game: r.gameNumber });
  }

  const awards: DayAward[] = [];
  const pickMax = (key: string, title: string, get: (p: ReplayPlayer) => number | null | undefined, fmt = (v: number) => String(v)) => {
    let best: { p: ReplayPlayer; game: number; v: number } | null = null;
    for (const row of rows) {
      const v = get(row.p) ?? 0;
      if (v > 0 && (!best || v > best.v)) best = { ...row, v };
    }
    if (best) awards.push({ key, title, userId: best.p.userId!, heroId: best.p.heroId, gameNumber: best.game, display: fmt(best.v) });
  };
  pickMax("farm", "Лучший фармер", (p) => p.lastHits);
  pickMax("assists", "Больше всех ассистов", (p) => p.assists);
  pickMax("wards", "Больше всех вардов", (p) => (p.obsPlaced ?? 0) + (p.senPlaced ?? 0));
  pickMax("networth", "Главный по нетворсу", (p) => p.netWorth, formatK);
  if (awards.length < 4 && rows.length) {
    // Самый живучий: меньше всех смертей, при равенстве — больше участия в убийствах
    const s = [...rows].sort((a, b) => a.p.deaths - b.p.deaths || b.p.kills + b.p.assists - (a.p.kills + a.p.assists))[0];
    awards.push({
      key: "survivor",
      title: "Самый живучий",
      userId: s.p.userId!,
      heroId: s.p.heroId,
      gameNumber: s.game,
      display: `${s.p.deaths} ${s.p.deaths === 1 ? "смерть" : s.p.deaths >= 2 && s.p.deaths <= 4 ? "смерти" : "смертей"}`,
    });
  }

  // MVP
  let mvp: DaySummary["mvp"] = null;
  if (session.mvpWinnerId) {
    const votes = await prisma.matchDayMvpVote.count({ where: { sessionId: session.id, nomineeId: session.mvpWinnerId } });
    const heroIds = [
      ...new Set(rows.filter((r) => r.p.userId === session.mvpWinnerId && r.p.heroId).map((r) => r.p.heroId as number)),
    ];
    mvp = {
      userId: session.mvpWinnerId,
      votes,
      heroIds,
      points: Math.round((pointsBy.get(session.mvpWinnerId) ?? 0) * 10) / 10,
    };
  }

  // Рекорды сезона, поставленные в этот день
  const { records } = await seasonHall();
  const hall = records
    .filter((r): r is HallRecord => Boolean(r && r.sessionId === session.id))
    .map((r) => ({ ...r, anti: nominationByCode(r.code)?.group === "anti" }));

  // Прогнозы: кто угадал все игры
  let predictions: DaySummary["predictions"] = null;
  const preds = await prisma.matchPrediction.findMany({
    where: { sessionId: session.id },
    select: { userId: true, gameNumber: true, pick: true },
  });
  if (preds.length) {
    const games = hasGame2Lineup(session) ? [1, 2] : [1];
    const users = [...new Set(preds.map((p) => p.userId))];
    const correctUserIds = users.filter((u) =>
      games.every((g) => {
        const pr = preds.find((p) => p.userId === u && p.gameNumber === g);
        const res = session.games.find((x) => x.gameNumber === g);
        return pr && res && res.winnerTeam === pr.pick;
      })
    );
    predictions = { total: users.length, correctUserIds };
  }

  return { mvp, awards: awards.slice(0, 4), hall, predictions, topPoints };
}
