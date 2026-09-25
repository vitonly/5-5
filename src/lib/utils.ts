import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Часовой пояс приложения (МСК, без перехода на летнее время). */
export const APP_TIMEZONE = "Europe/Moscow";
const APP_UTC_OFFSET = "+03:00";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Парсит значение из `<input type="datetime-local">` (YYYY-MM-DDTHH:mm)
 * как московское время. Без этого Node/Vercel читает строку как UTC → +3ч на экране.
 */
export function parseAppDateTime(value: string | Date): Date {
  if (value instanceof Date) return value;
  const raw = String(value).trim();
  if (!raw) return new Date(NaN);
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) return new Date(raw);

  // 2026-09-26T15:30 или 2026-09-26T15:30:00
  const m = raw.match(
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2}))?(?:\.\d+)?$/
  );
  if (m) {
    const sec = m[3] ?? "00";
    return new Date(`${m[1]}T${m[2]}:${sec}${APP_UTC_OFFSET}`);
  }

  // Только дата YYYY-MM-DD — полночь по Москве
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T00:00:00${APP_UTC_OFFSET}`);
  }

  return new Date(raw);
}

export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TIMEZONE,
  }).format(new Date(date));
}

export function displayName(user: {
  firstName: string;
  lastName?: string | null;
  username?: string | null;
}) {
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return full || user.username || "Игрок";
}

export function playerProfilePath(
  userId: string,
  viewer?: { id: string; role: string } | null
) {
  if (viewer?.id === userId && viewer.role === "STUDENT") return "/profile";
  return `/player/${userId}`;
}

export function materialDisplayTitle(m: {
  title: string;
  url?: string | null;
  type: string;
}) {
  const title = m.title?.trim();
  if (title) return title;
  if (m.url) return m.url;
  return "Материал";
}

export function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function toJsonArray(values: string[]): string {
  return JSON.stringify(values);
}

export function youtubeId(url?: string | null): string | null {
  if (!url) return null;
  const patterns = [
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export function videoThumbnail(url?: string | null): string | null {
  const id = youtubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}
