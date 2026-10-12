import { APP_TIMEZONE } from "@/lib/utils";

/** «сб, 12 окт · 12:00» */
export function formatShortDateTime(date: Date | string) {
  const d = new Date(date);
  const day = new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: APP_TIMEZONE,
  })
    .format(d)
    .replace(".", "");
  const time = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TIMEZONE,
  }).format(d);
  return `${day} · ${time}`;
}

/** «12 окт» */
export function formatShortDate(date: Date | string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    timeZone: APP_TIMEZONE,
  })
    .format(new Date(date))
    .replace(".", "");
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
