import { NextRequest, NextResponse } from "next/server";
import { setSessionCookieOnResponse } from "@/lib/session";
import { upsertTelegramUser, validateTelegramAuth } from "@/lib/telegram-auth";

/**
 * Redirect-flow Login Widget: Telegram присылает GET с query-параметрами.
 * data-auth-url=/api/auth/telegram/callback
 */
export async function GET(request: NextRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    (host ? `${proto}://${host}` : request.nextUrl.origin)
  ).replace(/\/$/, "");
  const loginUrl = new URL("/login", appUrl);

  if (!botToken || botToken === "dev-token") {
    loginUrl.searchParams.set("error", "bot_not_configured");
    return NextResponse.redirect(loginUrl);
  }

  const params: Record<string, string> = {};
  request.nextUrl.searchParams.forEach((value, key) => {
    params[key] = value;
  });

  if (!params.hash || !params.id || !params.auth_date) {
    loginUrl.searchParams.set("error", "telegram_cancelled");
    return NextResponse.redirect(loginUrl);
  }

  if (!validateTelegramAuth(params, botToken)) {
    loginUrl.searchParams.set("error", "telegram_invalid");
    return NextResponse.redirect(loginUrl);
  }

  try {
    const user = await upsertTelegramUser({
      id: params.id,
      first_name: params.first_name || "Игрок",
      last_name: params.last_name,
      username: params.username,
      photo_url: params.photo_url,
    });

    const dest = user.role === "ADMIN" ? "/admin" : "/";
    const response = NextResponse.redirect(new URL(dest, appUrl));
    await setSessionCookieOnResponse(response, user.id);
    return response;
  } catch {
    loginUrl.searchParams.set("error", "telegram_failed");
    return NextResponse.redirect(loginUrl);
  }
}
