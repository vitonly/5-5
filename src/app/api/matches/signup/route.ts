import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { formatDate, parseAppDateTime } from "@/lib/utils";
import {
  adminRemoveFromSignup,
  adminReinvitePlayer,
  coachJoinSignup,
  coachLeaveSignup,
  confirmLineups,
  createOpenSignupSession,
  listStudentsWithTelegram,
  startMatchSession,
} from "@/lib/match-signup";
import { sendTelegramTestToAdmin } from "@/lib/tg-test";
import type { InlineKeyboard } from "@/lib/telegram";
import { handleAuth } from "@/lib/api-auth";

const TEST_SIGNUP_KEYBOARD: InlineKeyboard = {
  inline_keyboard: [
    [
      { text: "✅ Я играю", callback_data: "m5:test:y" },
      { text: "❌ Не играю", callback_data: "m5:test:n" },
    ],
  ],
};

async function getHandler() {
  await requireAdmin();
  const students = await listStudentsWithTelegram(true);
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

async function postHandler(request: NextRequest) {
  const admin = await requireAdmin();
  const body = await request.json();
  const { date, inviteUserIds, inviteAll, testToAdmin } = body;

  if (testToAdmin) {
    if (!date) {
      return NextResponse.json({ error: "Укажите дату для превью" }, { status: 400 });
    }
    try {
      const when = parseAppDateTime(date);
      const inviteText = `🎮 <b>Открыта запись на 5v5</b>\n\nДата: ${formatDate(when)}\n\nНажмите кнопку ниже. Первые 10 попадают в состав, остальные — в очередь.\n\n<i>(Это тест — кнопки не записывают)</i>`;
      await sendTelegramTestToAdmin(admin.id, inviteText, {
        photoUrl:
          typeof body.inviteImageUrl === "string" ? body.inviteImageUrl : null,
        keyboard: TEST_SIGNUP_KEYBOARD,
      });
      return NextResponse.json({ success: true, test: true });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Ошибка теста" },
        { status: 400 }
      );
    }
  }

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

async function patchHandler(request: NextRequest) {
  const admin = await requireAdmin();
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

    // Тренер сам записывается / выходит кнопкой на сайте
    if (action === "coachJoin" || action === "coachLeave") {
      const result =
        action === "coachJoin"
          ? await coachJoinSignup(sessionId, admin.id)
          : await coachLeaveSignup(sessionId, admin.id);
      if (!result.ok) {
        return NextResponse.json({ error: result.alert || "Не получилось" }, { status: 400 });
      }
      return NextResponse.json({ ok: true, message: result.toast });
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

// Нет входа / нет прав — ответ 401 / 403, а не «ошибка сервера»
export const GET = handleAuth(getHandler);
export const POST = handleAuth(postHandler);
export const PATCH = handleAuth(patchHandler);
