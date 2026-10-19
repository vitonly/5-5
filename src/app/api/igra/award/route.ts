import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { addPoints } from "@/lib/points";

/**
 * Очки школы за места в «Своей игре».
 * Вызывает только служба игры с того же сервера: в заголовке x-igra-key
 * HMAC от JWT_SECRET («igra-award»), отдельный секрет заводить не нужно.
 * Повторный вызов для той же игры ничего не начисляет (sourceType "igra", sourceId = id игры).
 */
type Award = { userId: string; place: number; delta: number };

function expectedKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update("igra-award").digest("hex");
}

function keyOk(given: string | null) {
  const exp = expectedKey();
  if (!exp || !given || given.length !== exp.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(exp));
}

export async function POST(req: NextRequest) {
  if (!keyOk(req.headers.get("x-igra-key"))) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as { gameId?: string; awards?: Award[] } | null;
  const gameId = String(body?.gameId || "").slice(0, 64);
  const awards = Array.isArray(body?.awards) ? body!.awards.slice(0, 50) : [];
  if (!gameId || !awards.length) {
    return NextResponse.json({ ok: false, error: "Пустой запрос" }, { status: 400 });
  }

  const results: { userId: string; delta: number; skipped?: string }[] = [];
  for (const a of awards) {
    const delta = Math.max(0, Math.min(10, Number(a.delta) || 0)); // защита от опечатки: не больше 10 за место
    const place = Math.max(1, Math.min(3, Math.round(Number(a.place) || 0)));
    if (!delta) continue;
    // Очки школы есть только у тех, у кого есть карточка игрока
    const profile = await prisma.playerProfile.findUnique({ where: { userId: a.userId }, select: { id: true } });
    if (!profile) { results.push({ userId: a.userId, delta: 0, skipped: "нет карточки" }); continue; }
    const already = await prisma.pointLog.findFirst({
      where: { userId: a.userId, sourceType: "igra", sourceId: gameId },
      select: { id: true },
    });
    if (already) { results.push({ userId: a.userId, delta: 0, skipped: "уже начислено" }); continue; }
    const added = await addPoints(a.userId, delta, `Бонус: Своя игра — ${place} место`, { type: "igra", id: gameId });
    results.push({ userId: a.userId, delta: added });
  }
  return NextResponse.json({ ok: true, results });
}
