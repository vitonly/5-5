import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import {
  castMvpVote,
  getMvpStatusForUser,
  resolveMvpIfReady,
  sendMvpVoteInvites,
} from "@/lib/match-mvp";
import { requireAdmin } from "@/lib/session";

export async function GET(request: NextRequest) {
  const user = await requireUser();
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId" }, { status: 400 });
  }
  await resolveMvpIfReady(sessionId).catch(() => null);
  const status = await getMvpStatusForUser(sessionId, user.id);
  return NextResponse.json({ status });
}

export async function POST(request: NextRequest) {
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
    await sendMvpVoteInvites(sessionId);
    return NextResponse.json({ ok: true });
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
    return NextResponse.json({ error: "Укажите sessionId и nomineeId" }, { status: 400 });
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
