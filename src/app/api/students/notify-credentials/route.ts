import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { notifyChatId, sendTelegramMessage } from "@/lib/telegram";
import { displayName } from "@/lib/utils";
import { sendTelegramTestToAdmin } from "@/lib/tg-test";
import { recipientFilter } from "@/lib/recipients";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://www.startdota.ru").replace(
  /\/$/,
  ""
);

function credentialsMessage(login: string, password: string) {
  return `🔑 <b>Вход на сайт START+</b>

Пока вход через VK не настроен — используйте логин и пароль:

Логин: <code>${escapeHtml(login)}</code>
Пароль: <code>${escapeHtml(password)}</code>

Сайт: ${APP_URL}/login

Отметьте согласие на обработку данных и войдите.
Telegram уже привязан — уведомления продолжат приходить сюда.

Не пересылайте пароль посторонним.`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  const body = await request.json().catch(() => ({}));
  const { testToAdmin, userId } = body as {
    testToAdmin?: boolean;
    userId?: string;
  };

  if (testToAdmin) {
    try {
      await sendTelegramTestToAdmin(
        admin.id,
        credentialsMessage("demo_login", "demo_password")
      );
      return NextResponse.json({ success: true, test: true });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Ошибка теста" },
        { status: 400 }
      );
    }
  }

  // Выбрали группу или отдельных учеников — отправляем только им
  const only = recipientFilter(body);
  const students = await prisma.user.findMany({
    where: {
      role: "STUDENT",
      ...(userId ? { id: userId } : only ? { id: { in: [...only] } } : {}),
      login: { not: null },
      loginPasswordTemp: { not: null },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      login: true,
      loginPasswordTemp: true,
      telegramChatId: true,
      telegramId: true,
    },
  });

  const ready = students.filter(
    (s) => s.login && s.loginPasswordTemp && notifyChatId(s)
  );
  const noTg = students.filter(
    (s) => s.login && s.loginPasswordTemp && !notifyChatId(s)
  );

  if (!ready.length && !noTg.length) {
    return NextResponse.json(
      {
        error:
          "Некого уведомлять: задайте ученикам логин и пароль заново (пароль сохраняется для рассылки только при сохранении), и убедитесь что Telegram привязан.",
      },
      { status: 400 }
    );
  }

  if (!ready.length) {
    return NextResponse.json(
      {
        error: "У всех с готовым паролем нет Telegram",
        skipped: noTg.map((s) => displayName(s)),
      },
      { status: 400 }
    );
  }

  let sent = 0;
  const failed: string[] = [];
  const skipped = noTg.map((s) => displayName(s));

  for (const student of ready) {
    const chatId = notifyChatId(student)!;
    const login = student.login!;
    const password = student.loginPasswordTemp!;
    const ok = await sendTelegramMessage(
      chatId,
      credentialsMessage(login, password)
    );
    if (ok) {
      await prisma.user.update({
        where: { id: student.id },
        data: { loginPasswordTemp: null },
      });
      sent++;
    } else {
      failed.push(displayName(student));
    }
  }

  return NextResponse.json({
    sent,
    skipped: skipped.length,
    skippedNames: skipped,
    failed,
  });
}
