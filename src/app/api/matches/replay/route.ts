import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { normalizeReplayPlayers } from "@/lib/replay";

export const runtime = "nodejs";
export const maxDuration = 300;

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

async function guard() {
  try {
    return await requireAdmin();
  } catch {
    return null;
  }
}

/**
 * Загрузка демки (.dem) для игры 5v5.
 * Тело запроса — сам файл (application/octet-stream), ?sessionId=…&gameNumber=…
 * Файл не сохраняем: стримим в парсер и храним только итоговую таблицу.
 */
export async function POST(request: NextRequest) {
  const admin = await guard();
  if (!admin) return bad("Только для тренера", 403);

  const sessionId = request.nextUrl.searchParams.get("sessionId") ?? "";
  const gameNumber = Number(request.nextUrl.searchParams.get("gameNumber"));
  if (!sessionId || !Number.isInteger(gameNumber) || gameNumber < 1) return bad("Не указан матч или номер игры");

  const session = await prisma.matchSession.findUnique({ where: { id: sessionId }, select: { id: true } });
  if (!session) return bad("Матч не найден", 404);

  const parserUrl = process.env.PARSER_URL;
  if (!parserUrl) return bad("Парсер демок не настроен на сервере (PARSER_URL)", 503);
  if (!request.body) return bad("Файл не получен");

  let parsed: Record<string, unknown>;
  try {
    const res = await fetch(`${parserUrl.replace(/\/$/, "")}/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: request.body,
      // @ts-expect-error — Node fetch: стримим тело без буферизации
      duplex: "half",
      signal: AbortSignal.timeout(280_000),
    });
    parsed = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || parsed.ok !== true) {
      return bad(typeof parsed.error === "string" ? `Парсер: ${parsed.error}` : "Не удалось разобрать демку", 422);
    }
  } catch (e) {
    console.error("[replay] parser request failed", e);
    return bad("Парсер не отвечает. Проверьте службу startplus-parser на сервере.", 502);
  }

  const rawPlayers = Array.isArray(parsed.players) ? (parsed.players as Record<string, unknown>[]) : [];
  if (rawPlayers.length === 0) return bad("В демке не найдены игроки", 422);

  const profiles = await prisma.playerProfile.findMany({
    where: { steamAccountId: { not: null } },
    select: { userId: true, steamAccountId: true },
  });
  const userByAccount = new Map(profiles.map((p) => [p.steamAccountId as number, p.userId]));
  const players = normalizeReplayPlayers(rawPlayers, userByAccount);

  const data = {
    durationSec: typeof parsed.durationSec === "number" ? Math.round(parsed.durationSec) : 0,
    radiantWin: typeof parsed.radiantWin === "boolean" ? parsed.radiantWin : null,
    radiantScore: typeof parsed.radiantScore === "number" ? parsed.radiantScore : 0,
    direScore: typeof parsed.direScore === "number" ? parsed.direScore : 0,
    dotaMatchId: typeof parsed.matchId === "string" ? parsed.matchId : null,
  };

  const replay = await prisma.matchReplay.upsert({
    where: { sessionId_gameNumber: { sessionId, gameNumber } },
    create: { sessionId, gameNumber, ...data, data: { players }, uploadedById: admin.id },
    update: { ...data, data: { players }, uploadedById: admin.id, createdAt: new Date() },
  });

  const matched = players.filter((p) => p.userId).length;
  return NextResponse.json({
    ok: true,
    replayId: replay.id,
    matched,
    total: players.length,
    unmatched: players.filter((p) => !p.userId).map((p) => p.name ?? "без ника"),
  });
}

export async function DELETE(request: NextRequest) {
  const admin = await guard();
  if (!admin) return bad("Только для тренера", 403);
  const sessionId = request.nextUrl.searchParams.get("sessionId") ?? "";
  const gameNumber = Number(request.nextUrl.searchParams.get("gameNumber"));
  await prisma.matchReplay.deleteMany({ where: { sessionId, gameNumber } });
  return NextResponse.json({ ok: true });
}
