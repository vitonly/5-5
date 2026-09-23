import { NextRequest, NextResponse } from "next/server";

/** Выставляет webhook бота на этот деплой. Нужен CRON_SECRET. */
export async function POST(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      return NextResponse.json({ error: "CRON_SECRET не задан в Vercel" }, { status: 503 });
    }

    const auth = request.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (token !== secret) {
      return NextResponse.json({ error: "Нет доступа: неверный CRON_SECRET" }, { status: 401 });
    }

    const botToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
    let appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");

    // fallback: взять хост из самого запроса
    if (!appUrl) {
      const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
      const proto = request.headers.get("x-forwarded-proto") || "https";
      if (host) appUrl = `${proto}://${host}`.replace(/\/$/, "");
    }

    if (!botToken || botToken === "dev-token") {
      return NextResponse.json(
        { error: "TELEGRAM_BOT_TOKEN пустой или неверный в Environment Variables" },
        { status: 500 }
      );
    }
    if (!appUrl) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_APP_URL пустой. Укажи https://5-5-kappa.vercel.app" },
        { status: 500 }
      );
    }

    const webhookUrl = `${appUrl}/api/telegram/webhook`;
    const body: Record<string, string> = { url: webhookUrl };

    const whSecret = (process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
    // Telegram: secret_token только A-Z a-z 0-9 _ -
    if (whSecret) {
      if (!/^[A-Za-z0-9_-]{1,256}$/.test(whSecret)) {
        return NextResponse.json(
          {
            error:
              "TELEGRAM_WEBHOOK_SECRET содержит недопустимые символы. Только латиница, цифры, _ и -. Или очисти переменную.",
          },
          { status: 500 }
        );
      }
      body.secret_token = whSecret;
    }

    const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { ok?: boolean; description?: string };

    if (!data.ok) {
      return NextResponse.json(
        {
          ok: false,
          webhookUrl,
          error: data.description || "Telegram отклонил setWebhook",
          telegram: data,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      webhookUrl,
      telegram: data,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Неизвестная ошибка setup-webhook" },
      { status: 500 }
    );
  }
}
