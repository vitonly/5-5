import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { APP_TIMEZONE, parseAppDateTime } from "@/lib/utils";
import { syncProgressFromOpenDota } from "@/lib/progress-opendota";

export type ProgressRange = "day" | "week" | "month" | "halfyear";

function moscowDayKey(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function rangeBounds(range: ProgressRange, anchor = new Date()): { from: Date; to: Date } {
  const key = moscowDayKey(anchor);
  const to = parseAppDateTime(`${key}T23:59`);
  const fromKey = (() => {
    const base = parseAppDateTime(`${key}T12:00`);
    const f = new Date(base);
    if (range === "day") return key;
    if (range === "week") f.setDate(f.getDate() - 6);
    else if (range === "month") f.setDate(f.getDate() - 29);
    else f.setDate(f.getDate() - 182);
    return moscowDayKey(f);
  })();
  const from = parseAppDateTime(`${fromKey}T00:00`);
  return { from, to };
}

function toDayDate(dateStr: string) {
  return parseAppDateTime(`${dateStr.slice(0, 10)}T12:00`);
}

function sumLogs(
  rows: { gamesPlayed: number; soloGames: number; partyGames: number; replaysWatched: number }[]
) {
  return {
    games: rows.reduce((s, r) => s + r.gamesPlayed, 0),
    solo: rows.reduce((s, r) => s + r.soloGames, 0),
    party: rows.reduce((s, r) => s + r.partyGames, 0),
    replays: rows.reduce((s, r) => s + r.replaysWatched, 0),
    days: rows.length,
  };
}

export async function GET(request: NextRequest) {
  const me = await requireUser();
  const sp = request.nextUrl.searchParams;
  const userIdParam = sp.get("userId");
  const rangeRaw = sp.get("range") || "week";
  const range = (
    ["day", "week", "month", "halfyear"].includes(rangeRaw) ? rangeRaw : "week"
  ) as ProgressRange;
  const dateParam = sp.get("date");
  const sync = sp.get("sync") === "1";

  let userId = me.id;
  if (userIdParam && userIdParam !== me.id) {
    if (me.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    userId = userIdParam;
  }

  // Мягкий sync при открытии своей вкладки (throttled внутри)
  if (sync && userId === me.id && me.role === "STUDENT") {
    await syncProgressFromOpenDota(userId).catch((e) =>
      console.error("[progress] opendota sync", e)
    );
  }

  const { from, to } = rangeBounds(range);

  const logs = await prisma.progressLog.findMany({
    where: { userId, date: { gte: from, lte: to } },
    orderBy: { date: "asc" },
  });

  const prevSpanMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - prevSpanMs);
  const prevLogs = await prisma.progressLog.findMany({
    where: { userId, date: { gte: prevFrom, lte: prevTo } },
  });

  const dayKey = dateParam?.slice(0, 10) || moscowDayKey();
  const dayDate = toDayDate(dayKey);
  let today = await prisma.progressLog.findUnique({
    where: { userId_date: { userId, date: dayDate } },
  });
  if (!today) {
    const start = parseAppDateTime(`${dayKey}T00:00`);
    const end = parseAppDateTime(`${dayKey}T23:59`);
    today = await prisma.progressLog.findFirst({
      where: { userId, date: { gte: start, lte: end } },
    });
  }

  const profile = await prisma.playerProfile.findUnique({
    where: { userId },
    select: {
      steamAccountId: true,
      dotaMatchesPrivate: true,
      dotaMatchesSyncedAt: true,
    },
  });

  return NextResponse.json({
    logs,
    current: sumLogs(logs),
    previous: sumLogs(prevLogs),
    range,
    from,
    to,
    today,
    dayKey,
    dota: {
      steamAccountId: profile?.steamAccountId ?? null,
      private: Boolean(profile?.dotaMatchesPrivate),
      syncedAt: profile?.dotaMatchesSyncedAt?.toISOString() ?? null,
      noSteam: !profile?.steamAccountId,
    },
  });
}

export async function PUT(request: NextRequest) {
  const me = await requireUser();
  if (me.role !== "STUDENT") {
    return NextResponse.json({ error: "Дневник заполняют ученики" }, { status: 403 });
  }

  const body = await request.json();
  const { date, replaysWatched, replayNotes, takeaways } = body as {
    date?: string;
    replaysWatched?: number;
    replayNotes?: string;
    takeaways?: string;
  };

  const key = (date || moscowDayKey()).slice(0, 10);
  const dayDate = toDayDate(key);
  const replays = Math.max(0, Math.min(100, Math.round(Number(replaysWatched) || 0)));

  // Игры только из OpenDota — PUT меняет реплеи и текст
  const existing = await prisma.progressLog.findUnique({
    where: { userId_date: { userId: me.id, date: dayDate } },
  });

  const log = await prisma.progressLog.upsert({
    where: { userId_date: { userId: me.id, date: dayDate } },
    create: {
      userId: me.id,
      date: dayDate,
      gamesPlayed: existing?.gamesPlayed ?? 0,
      soloGames: existing?.soloGames ?? 0,
      partyGames: existing?.partyGames ?? 0,
      replaysWatched: replays,
      replayNotes: String(replayNotes ?? "").slice(0, 4000),
      takeaways: String(takeaways ?? "").slice(0, 4000),
    },
    update: {
      replaysWatched: replays,
      replayNotes: String(replayNotes ?? "").slice(0, 4000),
      takeaways: String(takeaways ?? "").slice(0, 4000),
    },
  });

  return NextResponse.json({ log });
}
