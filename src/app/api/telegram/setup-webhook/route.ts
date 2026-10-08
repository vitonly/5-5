import { NextRequest, NextResponse } from "next/server";
import { telegramApiBase, telegramBotUrl, telegramProxyHeaders } from "@/lib/telegram-api";

/** Выставляет webhook бота. Нужен CRON_SECRET. */
export async function POST(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      return NextResponse.json({ error: "CRON_SECRET не задан" }, { status: 503 });
    }

    const auth = request.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (token !== secret) {
      return NextResponse.json({ error: "Нет доступа: неверный CRON_SECRET" }, { status: 401 });
    }

    const botToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
    let appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");

    if (!appUrl) {
      const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
      const proto = request.headers.get("x-forwarded-proto") || "https";
      if (host) appUrl = `${proto}://${host}`.replace(/\/$/, "");
    }

    if (!botToken || botToken === "dev-token") {
      return NextResponse.json(
        { error: "TELEGRAM_BOT_TOKEN пустой или неверный" },
        { status: 500 }
      );
    }

    // Если есть CF proxy — webhook на Worker (Telegram стабильно достучится до Cloudflare)
    const proxyBase = telegramApiBase();
    const useProxy = Boolean(process.env.TELEGRAM_API_BASE?.trim());
    const webhookUrl = useProxy
      ? `${proxyBase}/webhook`
      : appUrl
        ? `${appUrl}/api/telegram/webhook`
        : "";

    if (!webhookUrl) {
      return NextResponse.json(
        { error: "Нужен TELEGRAM_API_BASE (CF proxy) или NEXT_PUBLIC_APP_URL" },
        { status: 500 }
      );
    }

    const body: Record<string, string> = { url: webhookUrl };

    const whSecret = (process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
    if (whSecret) {
      if (!/^[A-Za-z0-9_-]{1,256}$/.test(whSecret)) {
        return NextResponse.json(
          {
            error:
              "TELEGRAM_WEBHOOK_SECRET содержит недопустимые символы. Только латиница, цифры, _ и -.",
          },
          { status: 500 }
        );
      }
      body.secret_token = whSecret;
    }

    const res = await fetch(telegramBotUrl(botToken, "setWebhook"), {
      method: "POST",
      headers: telegramProxyHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
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
      viaProxy: useProxy,
      telegram: data,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Неизвестная ошибка setup-webhook" },
      { status: 500 }
    );
  }
}
