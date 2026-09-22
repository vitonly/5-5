import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSession, isAdminTelegramId } from "@/lib/session";
import { validateTelegramAuth, type TelegramUser } from "@/lib/telegram-auth";
export async function POST(request: NextRequest) {
  const body = await request.json();
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken || botToken === "dev-token") {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Telegram bot не настроен" }, { status: 500 });
    }
  } else if (!validateTelegramAuth(body as TelegramUser, botToken)) {
    return NextResponse.json({ error: "Неверная подпись Telegram" }, { status: 401 });
  }

  const data = body as TelegramUser;
  const telegramId = String(data.id);
  const isAdmin = isAdminTelegramId(telegramId);

  const user = await prisma.user.upsert({
    where: { telegramId },
    update: {
      telegramChatId: telegramId,
      firstName: data.first_name,
      lastName: data.last_name || null,
      username: data.username || null,
      photoUrl: data.photo_url || null,
      role: isAdmin ? "ADMIN" : undefined,
    },
    create: {
      telegramId,
      telegramChatId: telegramId,
      firstName: data.first_name,
      lastName: data.last_name || null,
      username: data.username || null,
      photoUrl: data.photo_url || null,
      role: isAdmin ? "ADMIN" : "STUDENT",
      profile: {
        create: {},
      },
    },
    include: { profile: true },
  });

  if (!user.profile) {
    await prisma.playerProfile.create({
      data: { userId: user.id },
    });
  }

  await createSession(user.id);
  return NextResponse.json({ success: true, role: user.role });
}
