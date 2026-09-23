import { NextRequest, NextResponse } from "next/server";

/** Выставляет webhook бота на этот деплой. Нужен CRON_SECRET. */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET не задан" }, { status: 503 });
  }

  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token !== secret) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (!botToken || !appUrl) {
    return NextResponse.json(
      { error: "Нужны TELEGRAM_BOT_TOKEN и NEXT_PUBLIC_APP_URL" },
      { status: 500 }
    );
  }

  const webhookUrl = `${appUrl}/api/telegram/webhook`;
  const body: Record<string, string> = { url: webhookUrl };
  if (process.env.TELEGRAM_WEBHOOK_SECRET) {
    body.secret_token = process.env.TELEGRAM_WEBHOOK_SECRET;
  }

  const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();

  return NextResponse.json({
    ok: data.ok === true,
    webhookUrl,
    telegram: data,
  });
}
