/**
 * База URL Telegram Bot API.
 * На VPS с плохим доступом к api.telegram.org — Cloudflare Worker proxy.
 */
export function telegramApiBase(): string {
  const base = (process.env.TELEGRAM_API_BASE || "https://api.telegram.org").trim();
  return base.replace(/\/$/, "") || "https://api.telegram.org";
}

export function telegramBotUrl(token: string, method: string): string {
  const m = method.replace(/^\//, "");
  return `${telegramApiBase()}/bot${token}/${m}`;
}

export function telegramProxyHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extra || {}) };
  const secret = process.env.TELEGRAM_PROXY_SECRET?.trim();
  if (secret) headers["X-Telegram-Proxy-Secret"] = secret;
  return headers;
}
