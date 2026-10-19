/**
 * Синк рейтинговых матчей OpenDota → ProgressLog (соло / пати по дням МСК).
 * Окно по умолчанию: с 1-го числа текущего месяца МСК. Реплеи/заметки не трогаем.
 */
import { prisma } from "@/lib/db";
import { APP_TIMEZONE, parseAppDateTime } from "@/lib/utils";

const RANKED_LOBBY = 7;
const THROTTLE_MS = 20 * 60_000; // мягкий sync с страницы — не чаще 20 мин
const CRON_PAUSE_MS = 1100;

type OdMatch = {
  match_id?: number;
  start_time?: number;
  lobby_type?: number;
  party_size?: number | null;
};

function moscowDayKey(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function toDayDate(dateStr: string) {
  return parseAppDateTime(`${dateStr.slice(0, 10)}T12:00`);
}

/** 1-е число текущего месяца МСК (YYYY-MM-DD). */
export function moscowMonthStartKey(anchor = new Date()): string {
  const key = moscowDayKey(anchor);
  return `${key.slice(0, 8)}01`;
}

/** Понедельник недели МСК для даты. */
export function moscowWeekMondayKey(anchor = new Date()): string {
  const key = moscowDayKey(anchor);
  const noon = parseAppDateTime(`${key}T12:00`);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    weekday: "short",
  }).format(noon);
  const map: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  const offset = map[weekday] ?? 0;
  const mon = new Date(noon);
  mon.setDate(mon.getDate() - offset);
  return moscowDayKey(mon);
}

export type WeeklyProgressPoint = {
  label: string;
  solo: number;
  party: number;
  replays: number;
};

/** Агрегат ProgressLog по неделям (пн МСК) — для графика в профиле. */
export async function getWeeklyProgressSeries(
  userId: string,
  weeks = 8
): Promise<WeeklyProgressPoint[]> {
  const thisMonday = moscowWeekMondayKey();
  const startNoon = parseAppDateTime(`${thisMonday}T12:00`);
  startNoon.setDate(startNoon.getDate() - (weeks - 1) * 7);
  const fromKey = moscowDayKey(startNoon);
  const from = parseAppDateTime(`${fromKey}T00:00`);
  const to = parseAppDateTime(`${moscowDayKey()}T23:59`);

  const logs = await prisma.progressLog.findMany({
    where: { userId, date: { gte: from, lte: to } },
    orderBy: { date: "asc" },
  });

  const weekKeys: string[] = [];
  for (let i = 0; i < weeks; i++) {
    const d = parseAppDateTime(`${thisMonday}T12:00`);
    d.setDate(d.getDate() - (weeks - 1 - i) * 7);
    weekKeys.push(moscowDayKey(d));
  }

  const byWeek = new Map<string, { solo: number; party: number; replays: number }>();
  for (const k of weekKeys) byWeek.set(k, { solo: 0, party: 0, replays: 0 });

  for (const log of logs) {
    const wk = moscowWeekMondayKey(log.date);
    if (!byWeek.has(wk)) continue;
    const cur = byWeek.get(wk)!;
    cur.solo += log.soloGames;
    cur.party += log.partyGames;
    cur.replays += log.replaysWatched;
  }

  const labelFmt = new Intl.DateTimeFormat("ru-RU", {
    timeZone: APP_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
  });

  return weekKeys.map((k) => {
    const cur = byWeek.get(k)!;
    return {
      label: labelFmt.format(parseAppDateTime(`${k}T12:00`)),
      solo: cur.solo,
      party: cur.party,
      replays: cur.replays,
    };
  });
}

function daysFromKeyInclusive(fromKey: string): number {
  const today = moscowDayKey();
  const t0 = parseAppDateTime(`${fromKey}T00:00`).getTime();
  const t1 = parseAppDateTime(`${today}T23:59`).getTime();
  return Math.max(1, Math.ceil((t1 - t0) / 86_400_000));
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson<T>(url: string): Promise<{ ok: boolean; status: number; data: T | null }> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, status: res.status, data: null };
    const data = (await res.json()) as T;
    return { ok: true, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

export type SyncUserResult = {
  userId: string;
  ok: boolean;
  private: boolean;
  noSteam: boolean;
  daysUpdated: number;
  rankedFound: number;
  error?: string;
};

/**
 * Синк одного ученика. Перезаписывает solo/party/gamesPlayed только в днях,
 * где OpenDota вернул рейтинговые матчи (с fromDayKey или с 1-го числа месяца).
 */
export async function syncProgressFromOpenDota(
  userId: string,
  opts?: { force?: boolean; fromDayKey?: string }
): Promise<SyncUserResult> {
  const profile = await prisma.playerProfile.findUnique({ where: { userId } });
  if (!profile?.steamAccountId) {
    return { userId, ok: false, private: false, noSteam: true, daysUpdated: 0, rankedFound: 0 };
  }

  if (
    !opts?.force &&
    profile.dotaMatchesSyncedAt &&
    Date.now() - profile.dotaMatchesSyncedAt.getTime() < THROTTLE_MS
  ) {
    return {
      userId,
      ok: true,
      private: profile.dotaMatchesPrivate,
      noSteam: false,
      daysUpdated: 0,
      rankedFound: 0,
    };
  }

  const accountId = profile.steamAccountId;
  const fromKey = opts?.fromDayKey ?? moscowMonthStartKey();
  const days = daysFromKeyInclusive(fromKey);
  const fromStartSec = Math.floor(parseAppDateTime(`${fromKey}T00:00`).getTime() / 1000);

  const playerRes = await fetchJson<{
    profile?: { account_id?: number; personaname?: string } | null;
  }>(`https://api.opendota.com/api/players/${accountId}`);

  const matchesRes = await fetchJson<OdMatch[]>(
    `https://api.opendota.com/api/players/${accountId}/matches?date=${days}&significant=0`
  );

  if (!matchesRes.ok || !Array.isArray(matchesRes.data)) {
    // API недоступен — не помечаем как private
    await prisma.playerProfile.update({
      where: { userId },
      data: { dotaMatchesSyncedAt: new Date() },
    });
    return {
      userId,
      ok: false,
      private: profile.dotaMatchesPrivate,
      noSteam: false,
      daysUpdated: 0,
      rankedFound: 0,
      error: `OpenDota matches HTTP ${matchesRes.status}`,
    };
  }

  const matches = matchesRes.data.filter(
    (m) =>
      m.lobby_type === RANKED_LOBBY &&
      typeof m.start_time === "number" &&
      m.start_time >= fromStartSec
  );

  // Приватность: нет profile в OpenDota, либо recent matches совсем пустые
  const hasProfile = Boolean(playerRes.ok && playerRes.data?.profile?.personaname);
  let privateFlag = !hasProfile;
  if (!privateFlag && matches.length === 0) {
    const anyRes = await fetchJson<OdMatch[]>(
      `https://api.opendota.com/api/players/${accountId}/matches?limit=5`
    );
    if (anyRes.ok && Array.isArray(anyRes.data) && anyRes.data.length === 0) {
      privateFlag = true;
    }
  }

  const byDay = new Map<string, { solo: number; party: number }>();
  for (const m of matches) {
    const start = (m.start_time ?? 0) * 1000;
    const day = moscowDayKey(new Date(start));
    if (day < fromKey) continue;
    const cur = byDay.get(day) ?? { solo: 0, party: 0 };
    const partySize = m.party_size;
    if (typeof partySize === "number" && partySize > 1) cur.party += 1;
    else cur.solo += 1;
    byDay.set(day, cur);
  }

  let daysUpdated = 0;
  for (const [day, counts] of byDay) {
    const date = toDayDate(day);
    const gamesPlayed = counts.solo + counts.party;
    await prisma.progressLog.upsert({
      where: { userId_date: { userId, date } },
      create: {
        userId,
        date,
        soloGames: counts.solo,
        partyGames: counts.party,
        gamesPlayed,
      },
      update: {
        soloGames: counts.solo,
        partyGames: counts.party,
        gamesPlayed,
      },
    });
    daysUpdated++;
  }

  await prisma.playerProfile.update({
    where: { userId },
    data: {
      dotaMatchesPrivate: privateFlag,
      dotaMatchesSyncedAt: new Date(),
    },
  });

  return {
    userId,
    ok: true,
    private: privateFlag,
    noSteam: false,
    daysUpdated,
    rankedFound: matches.length,
  };
}

/** Cron / ручной прогон: все ученики с steamAccountId */
export async function syncAllStudentsProgressFromOpenDota(opts?: { fromDayKey?: string }) {
  const profiles = await prisma.playerProfile.findMany({
    where: { steamAccountId: { not: null }, user: { role: "STUDENT" } },
    select: { userId: true },
  });
  let synced = 0;
  let privateCount = 0;
  let rankedTotal = 0;
  let daysUpdated = 0;
  const errors: string[] = [];
  for (const p of profiles) {
    try {
      const r = await syncProgressFromOpenDota(p.userId, {
        force: true,
        fromDayKey: opts?.fromDayKey,
      });
      if (r.ok) synced++;
      if (r.private) privateCount++;
      rankedTotal += r.rankedFound;
      daysUpdated += r.daysUpdated;
      if (r.error) errors.push(`${p.userId}:${r.error}`);
    } catch (e) {
      errors.push(`${p.userId}:${e instanceof Error ? e.message : String(e)}`);
    }
    await sleep(CRON_PAUSE_MS);
  }
  return {
    students: profiles.length,
    synced,
    privateCount,
    rankedTotal,
    daysUpdated,
    fromDayKey: opts?.fromDayKey ?? moscowMonthStartKey(),
    errors: errors.slice(0, 20),
  };
}
