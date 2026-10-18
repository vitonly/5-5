import { APP_TIMEZONE } from "@/lib/utils";

/** Год показываем, только если дата не из текущего года: «12 окт» / «12 окт 2025» */
function yearIfOther(d: Date): { year?: "numeric" } {
  const y = (x: Date) => new Intl.DateTimeFormat("ru-RU", { year: "numeric", timeZone: APP_TIMEZONE }).format(x);
  return y(d) === y(new Date()) ? {} : { year: "numeric" };
}

/*
 * Единый формат дат в интерфейсе: коротко, по-русски — «12 окт», «сб, 12 окт · 12:00».
 * Длинный formatDate («12 октября 2026 г. в 12:00») остаётся для сообщений в Telegram.
 */

/** «сб, 12 окт · 12:00» */
export function formatShortDateTime(date: Date | string) {
  const d = new Date(date);
  const day = new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...yearIfOther(d),
    timeZone: APP_TIMEZONE,
  })
    .format(d)
    .replace(".", "")
    .replace(/\s*г\.?$/, "");
  const time = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TIMEZONE,
  }).format(d);
  return `${day} · ${time}`;
}

/** «12 окт» */
export function formatShortDate(date: Date | string) {
  const d = new Date(date);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    ...yearIfOther(d),
    timeZone: APP_TIMEZONE,
  })
    .format(d)
    .replace(".", "")
    .replace(/\s*г\.?$/, "");
}

/** «через 2 дн», «через 5 ч», «сегодня», «просрочено» */
export function formatRelative(date: Date | string, now = new Date()) {
  const diff = new Date(date).getTime() - now.getTime();
  if (diff < 0) return "уже прошло";
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "меньше часа";
  if (h < 24) return `через ${h} ч`;
  const d = Math.floor(h / 24);
  return `через ${d} дн`;
}

export function initials(firstName?: string | null, lastName?: string | null) {
  return `${(firstName ?? "").trim().charAt(0)}${(lastName ?? "").trim().charAt(0)}`.toUpperCase() || "?";
}
