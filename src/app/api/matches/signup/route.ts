import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { parseAppDateTime } from "@/lib/utils";
import {
  adminRemoveFromSignup,
  adminReinvitePlayer,
  confirmLineups,
  createOpenSignupSession,
  listStudentsWithTelegram,
  startMatchSession,
} from "@/lib/match-signup";

export async function GET() {
  await requireAdmin();
  const students = await listStudentsWithTelegram();
  return NextResponse.json({
    students: students.map((s) => ({
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      username: s.username,
      telegramChatId: s.telegramChatId,
    })),
  });
}

export async function POST(request: NextRequest) {
  await requireAdmin();
  const body = await request.json();
  const { date, inviteUserIds, inviteAll } = body;

  if (!date) {
    return NextResponse.json({ error: "Укажите дату" }, { status: 400 });
  }

  try {
    let ids: string[] = Array.isArray(inviteUserIds) ? inviteUserIds.map(String) : [];
    if (inviteAll) {
      const withTg = await listStudentsWithTelegram();
      ids = withTg.map((u) => u.id);
    }
    if (!ids.length) {
      return NextResponse.json(
        { error: "Нет учеников для рассылки (нужен привязанный Telegram)" },
        { status: 400 }
      );
    }

    const session = await createOpenSignupSession({
      date: parseAppDateTime(date),
      inviteUserIds: ids,
      inviteImageUrl:
        typeof body.inviteImageUrl === "string" ? body.inviteImageUrl : null,
    });
    return NextResponse.json({
      session: {
        id: session.id,
        date: session.date,
        status: session.status,
        mode: session.mode,
      },
      invited: ids.length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Не удалось создать" },
      { status: 400 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  await requireAdmin();
  const body = await request.json();
  const { action, sessionId, userId } = body;

  if (!sessionId) {
    return NextResponse.json({ error: "Укажите sessionId" }, { status: 400 });
  }

  try {
    if (action === "removePlayer") {
      if (!userId) {
        return NextResponse.json({ error: "Укажите userId" }, { status: 400 });
      }
      const result = await adminRemoveFromSignup(sessionId, String(userId));
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "reinvite") {
      if (!userId) {
        return NextResponse.json({ error: "Укажите userId" }, { status: 400 });
      }
      await adminReinvitePlayer(sessionId, String(userId));
      return NextResponse.json({ ok: true });
    }

    if (action === "confirmLineups") {
      const session = await confirmLineups(sessionId);
      return NextResponse.json({ session });
    }

    if (action === "startSession") {
      const session = await startMatchSession(sessionId);
      return NextResponse.json({ session });
    }

    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ошибка" },
      { status: 400 }
    );
  }
}
