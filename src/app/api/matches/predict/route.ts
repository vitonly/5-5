import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireUser } from "@/lib/session";
import { castPrediction, openPredictions, type Side } from "@/lib/match-predictions";
import { handleAuth } from "@/lib/api-auth";

/**
 * POST { sessionId, gameNumber, pick: "RADIANT"|"DIRE" } — прогноз ученика
 * POST { sessionId, action: "open" } — админ открывает прогнозы (+ рассылка в TG)
 */
async function postHandler(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    sessionId?: string;
    gameNumber?: number;
    pick?: Side;
    action?: string;
  };
  if (!body.sessionId) return NextResponse.json({ error: "sessionId" }, { status: 400 });

  if (body.action === "open") {
    await requireAdmin();
    try {
      const { sent } = await openPredictions(body.sessionId);
      return NextResponse.json({ ok: true, sent });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
    }
  }

  const user = await requireUser();
  try {
    await castPrediction({
      sessionId: body.sessionId,
      userId: user.id,
      gameNumber: Number(body.gameNumber),
      pick: body.pick as Side,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
}

// Нет входа / нет прав — ответ 401 / 403, а не «ошибка сервера»
export const POST = handleAuth(postHandler);
