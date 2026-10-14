import { prisma } from "@/lib/db";
import type { ReplayData, ReplayPlayer } from "@/lib/replay";

/* Статистика ученика по загруженным демкам (+ напарники по всем играм 5v5) */

export type HeroStat = {
  heroId: number;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  netWorth: number;
  lastPlayed: string;
};

export type RecordStat = {
  key: "kills" | "netWorth" | "assists" | "level" | "lastHits";
  label: string;
  value: number;
  heroId: number | null;
  date: string;
};

export type RecentGame = {
  sessionId: string;
  gameNumber: number;
  date: string;
  durationSec: number;
  won: boolean | null;
  heroId: number | null;
  kills: number;
  deaths: number;
  assists: number;
  netWorth: number;
  items: (string | null)[];
};

export type MateStat = {
  userId: string;
  firstName: string;
  lastName: string | null;
  username: string | null;
  photoUrl: string | null;
  games: number;
  wins: number;
};

export type ReplayStats = {
  games: number;
  wins: number;
  losses: number;
  totalPlayed: number;
  avg: {
    kills: number;
    deaths: number;
    assists: number;
    level: number;
    lastHits: number;
    denies: number;
    netWorth: number;
  };
  heroes: HeroStat[];
  records: RecordStat[];
  recent: RecentGame[];
  mates: MateStat[];
};

const round1 = (v: number) => Math.round(v * 10) / 10;

export async function getReplayStats(userId: string): Promise<ReplayStats | null> {
  const [replays, totalPlayed, myParts] = await Promise.all([
    prisma.matchReplay.findMany({
      select: {
        sessionId: true,
        gameNumber: true,
        durationSec: true,
        radiantWin: true,
        data: true,
        session: { select: { date: true } },
      },
    }),
    prisma.matchParticipant.count({ where: { userId } }),
    prisma.matchParticipant.findMany({ where: { userId }, select: { gameId: true, team: true, won: true } }),
  ]);

  type Entry = { sessionId: string; gameNumber: number; date: Date; durationSec: number; won: boolean | null; p: ReplayPlayer };
  const entries: Entry[] = [];
  for (const r of replays) {
    const me = ((r.data as ReplayData | null)?.players ?? []).find((p) => p.userId === userId);
    if (!me) continue;
    entries.push({
      sessionId: r.sessionId,
      gameNumber: r.gameNumber,
      date: new Date(r.session.date),
      durationSec: r.durationSec,
      won: r.radiantWin == null ? null : (me.team === "RADIANT") === r.radiantWin,
      p: me,
    });
  }

  const mates = await getMates(userId, myParts);
  if (!entries.length) return mates.length ? emptyWithMates(totalPlayed, mates) : null;

  entries.sort((a, b) => b.date.getTime() - a.date.getTime() || b.gameNumber - a.gameNumber);
  const n = entries.length;
  const sum = (f: (e: Entry) => number) => entries.reduce((s, e) => s + f(e), 0);

  // Герои
  const heroMap = new Map<number, HeroStat>();
  for (const e of entries) {
    if (e.p.heroId == null) continue;
    const h =
      heroMap.get(e.p.heroId) ??
      { heroId: e.p.heroId, games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, netWorth: 0, lastPlayed: e.date.toISOString() };
    h.games++;
    if (e.won) h.wins++;
    h.kills += e.p.kills;
    h.deaths += e.p.deaths;
    h.assists += e.p.assists;
    h.netWorth += e.p.netWorth;
    heroMap.set(e.p.heroId, h);
  }
  const heroes = [...heroMap.values()]
    .map((h) => ({
      ...h,
      kills: round1(h.kills / h.games),
      deaths: round1(h.deaths / h.games),
      assists: round1(h.assists / h.games),
      netWorth: Math.round(h.netWorth / h.games),
    }))
    .sort((a, b) => b.games - a.games || b.wins - a.wins);

  // Рекорды
  const best = (key: RecordStat["key"], label: string, get: (e: Entry) => number | null | undefined): RecordStat | null => {
    let top: Entry | null = null;
    let val = 0;
    for (const e of entries) {
      const v = get(e) ?? 0;
      if (v > val) {
        val = v;
        top = e;
      }
    }
    return top ? { key, label, value: val, heroId: top.p.heroId, date: top.date.toISOString() } : null;
  };
  const records = [
    best("kills", "Больше всего убийств", (e) => e.p.kills),
    best("netWorth", "Самый большой нетворс", (e) => e.p.netWorth),
    best("assists", "Больше всего ассистов", (e) => e.p.assists),
    best("level", "Самый высокий уровень", (e) => e.p.level),
    best("lastHits", "Больше всего добиваний", (e) => e.p.lastHits),
  ].filter((x): x is RecordStat => x !== null);

  const wins = entries.filter((e) => e.won === true).length;
  const losses = entries.filter((e) => e.won === false).length;

  return {
    games: n,
    wins,
    losses,
    totalPlayed,
    avg: {
      kills: round1(sum((e) => e.p.kills) / n),
      deaths: round1(sum((e) => e.p.deaths) / n),
      assists: round1(sum((e) => e.p.assists) / n),
      level: round1(sum((e) => e.p.level ?? 0) / n),
      lastHits: Math.round(sum((e) => e.p.lastHits) / n),
      denies: Math.round(sum((e) => e.p.denies) / n),
      netWorth: Math.round(sum((e) => e.p.netWorth) / n),
    },
    heroes,
    records,
    recent: entries.slice(0, 5).map((e) => ({
      sessionId: e.sessionId,
      gameNumber: e.gameNumber,
      date: e.date.toISOString(),
      durationSec: e.durationSec,
      won: e.won,
      heroId: e.p.heroId,
      kills: e.p.kills,
      deaths: e.p.deaths,
      assists: e.p.assists,
      netWorth: e.p.netWorth,
      items: e.p.items.filter(Boolean),
    })),
    mates,
  };
}

function emptyWithMates(totalPlayed: number, mates: MateStat[]): ReplayStats {
  return {
    games: 0,
    wins: 0,
    losses: 0,
    totalPlayed,
    avg: { kills: 0, deaths: 0, assists: 0, level: 0, lastHits: 0, denies: 0, netWorth: 0 },
    heroes: [],
    records: [],
    recent: [],
    mates,
  };
}

/** Напарники по всем играм 5v5 (не только с демкой): минимум 3 игры вместе, лучший винрейт */
async function getMates(userId: string, myParts: { gameId: string; team: string; won: boolean }[]) {
  if (!myParts.length) return [];
  const teamByGame = new Map(myParts.map((p) => [p.gameId, p]));
  const others = await prisma.matchParticipant.findMany({
    where: { gameId: { in: [...teamByGame.keys()] }, userId: { not: userId } },
    select: { gameId: true, team: true, userId: true },
  });
  const agg = new Map<string, { games: number; wins: number }>();
  for (const o of others) {
    const mine = teamByGame.get(o.gameId);
    if (!mine || mine.team !== o.team) continue;
    const a = agg.get(o.userId) ?? { games: 0, wins: 0 };
    a.games++;
    if (mine.won) a.wins++;
    agg.set(o.userId, a);
  }
  const top = [...agg.entries()]
    .filter(([, a]) => a.games >= 3)
    .sort((x, y) => y[1].wins / y[1].games - x[1].wins / x[1].games || y[1].games - x[1].games)
    .slice(0, 3);
  if (!top.length) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: top.map(([id]) => id) } },
    select: { id: true, firstName: true, lastName: true, username: true, photoUrl: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  return top
    .map(([id, a]) => {
      const u = byId.get(id);
      return u
        ? { userId: id, firstName: u.firstName, lastName: u.lastName, username: u.username, photoUrl: u.photoUrl, games: a.games, wins: a.wins }
        : null;
    })
    .filter((x): x is MateStat => x !== null);
}
