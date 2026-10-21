import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireAdmin } from "@/lib/session";
import {
  castMvpVote,
  getMvpAdminBreakdown,
  getMvpStatusForUser,
  resolveMvpIfReady,
  sendMvpVoteInvites,
} from "@/lib/match-mvp";
import { handleAuth } from "@/lib/api-auth";

async function getHandler(request: NextRequest) {
  const user = await requireUser();
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId" }, { status: 400 });
  }
  await resolveMvpIfReady(sessionId).catch(() => null);

  if (request.nextUrl.searchParams.get("admin") === "1") {
    await requireAdmin();
    const breakdown = await getMvpAdminBreakdown(sessionId);
    return NextResponse.json({ breakdown });
  }

  const status = await getMvpStatusForUser(sessionId, user.id);
  return NextResponse.json({ status });
}

async function postHandler(request: NextRequest) {
  const user = await requireUser();
  const body = await request.json();
  const { sessionId, nomineeId, action } = body as {
    sessionId?: string;
    nomineeId?: string;
    action?: string;
  };

  if (action === "sendInvites") {
    await requireAdmin();
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId" }, { status: 400 });
    }
    const report = await sendMvpVoteInvites(sessionId);
    return NextResponse.json({ ok: true, ...report });
  }

  if (action === "resolve") {
    await requireAdmin();
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId" }, { status: 400 });
    }
    const result = await resolveMvpIfReady(sessionId);
    return NextResponse.json({ result });
  }

  if (!sessionId || !nomineeId) {
    return NextResponse.json(
      { error: "Укажите sessionId и nomineeId" },
      { status: 400 }
    );
  }

  try {
    const result = await castMvpVote({
      sessionId,
      voterId: user.id,
      nomineeId: String(nomineeId),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ошибка" },
      { status: 400 }
    );
  }
}

// Нет входа / нет прав — ответ 401 / 403, а не «ошибка сервера»
export const GET = handleAuth(getHandler);
export const POST = handleAuth(postHandler);
