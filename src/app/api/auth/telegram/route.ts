import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/session";
import { upsertTelegramUser, validateTelegramAuth, type TelegramUser } from "@/lib/telegram-auth";

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

  const user = await upsertTelegramUser(body as TelegramUser);
  await createSession(user.id);
  return NextResponse.json({ success: true, role: user.role });
}
