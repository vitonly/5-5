import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse, after } from "next/server";
import { handleTelegramUpdate, type TelegramUpdate } from "@/lib/telegram-bot";

/**
 * Пришёл ли запрос действительно от Telegram.
 * Telegram кладёт в заголовок секрет, который мы задали в setWebhook (TELEGRAM_WEBHOOK_SECRET).
 * Без этой проверки любой мог прислать «сообщение от имени» любого пользователя бота
 * (например, подтвердить вход на сайт за админа).
 */
function fromTelegram(request: NextRequest): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  // Локально (npm run dev) секрет можно не задавать, на боевом сервере — обязательно
  if (!secret) return process.env.NODE_ENV !== "production";
  const given = request.headers.get("x-telegram-bot-api-secret-token") || "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  // timingSafeEqual сравнивает за одинаковое время — по скорости ответа секрет не подобрать
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!fromTelegram(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
