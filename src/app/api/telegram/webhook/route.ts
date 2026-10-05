import { NextRequest, NextResponse, after } from "next/server";
import { handleTelegramUpdate, type TelegramUpdate } from "@/lib/telegram-bot";

export async function POST(request: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const header = request.headers.get("x-telegram-bot-api-secret-token");
    if (header !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  // Быстрый 200 для Telegram — обработка в фоне, иначе Connection timed out
  after(async () => {
    try {
      await handleTelegramUpdate(update);
    } catch (e) {
      console.error("[telegram webhook]", e);
    }
  });

  return NextResponse.json({ ok: true });
}
