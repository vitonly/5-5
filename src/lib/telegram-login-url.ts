/**
 * Ссылка на бота для входа через Telegram.
 * Собирается только из токена тикета и имени бота из конфигурации —
 * адрес из URL-параметров или sessionStorage никогда не используется для перехода
 * (иначе можно подсунуть javascript: или чужой сайт).
 */

const BOT = (process.env.NEXT_PUBLIC_BOT_USERNAME || "").trim().replace(/^@/, "");

/** Тикет — 16 случайных байт в hex (см. /api/auth/telegram/ticket) */
const TOKEN_RE = /^[a-f0-9]{32}$/;
/** Имя бота Telegram: 5–32 символа, латиница, цифры и _ */
const BOT_RE = /^[A-Za-z0-9_]{5,32}$/;

export function isLoginTicketToken(token: string | null | undefined): token is string {
  return typeof token === "string" && TOKEN_RE.test(token);
}

/** https://t.me/<бот>?start=login_<token> или null, если токен/бот некорректны */
export function telegramLoginUrl(token: string | null | undefined): string | null {
  if (!isLoginTicketToken(token) || !BOT_RE.test(BOT)) return null;
  return `https://t.me/${BOT}?start=login_${token}`;
}

/** tg://resolve?... — открывает приложение напрямую (надёжнее на телефоне) */
export function telegramLoginDeepLink(token: string | null | undefined): string | null {
  if (!isLoginTicketToken(token) || !BOT_RE.test(BOT)) return null;
  return `tg://resolve?domain=${encodeURIComponent(BOT)}&start=${encodeURIComponent(`login_${token}`)}`;
}
