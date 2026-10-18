import crypto from "crypto";
import { prisma } from "@/lib/db";
import { isAdminTelegramId } from "@/lib/session";

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export function validateTelegramAuth(
  data: Record<string, string | number | undefined>,
  botToken: string
): boolean {
  const hash = String(data.hash || "");
  if (!hash) return false;

  const authDate = Number(data.auth_date);
  if (!authDate) return false;
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > 86400) return false;

  const rest: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === "hash" || value === undefined || value === null) continue;
    rest[key] = String(value);
  }

  const checkString = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${rest[key]}`)
    .join("\n");

  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  const hmac = crypto.createHmac("sha256", secretKey).update(checkString).digest("hex");

  return hmac === hash;
}

/**
 * Вход через Telegram: находит аккаунт по Telegram ID и обновляет данные.
 * Новый аккаунт создаётся ТОЛЬКО для тренера (ADMIN_TELEGRAM_IDS) — остальных
 * тренер заводит сам, иначе любой человек с Telegram получал доступ к платформе.
 * Возвращает null, если такого аккаунта нет.
 */
export async function upsertTelegramUser(data: {
  id: number | string;
  first_name: string;
  last_name?: string | null;
  username?: string | null;
  photo_url?: string | null;
}) {
  const telegramId = String(data.id);
  const isAdmin = isAdminTelegramId(telegramId);

  const existing = await prisma.user.findUnique({ where: { telegramId }, select: { id: true } });
  if (!existing && !isAdmin) return null;

  const user = await prisma.user.upsert({
    where: { telegramId },
    update: {
      telegramChatId: telegramId,
      firstName: data.first_name,
      lastName: data.last_name || null,
      username: data.username || null,
      photoUrl: data.photo_url || null,
      role: isAdmin ? "ADMIN" : undefined,
    },
    create: {
      telegramId,
      telegramChatId: telegramId,
      firstName: data.first_name,
      lastName: data.last_name || null,
      username: data.username || null,
      photoUrl: data.photo_url || null,
      role: "ADMIN",
      profile: { create: {} },
    },
    include: { profile: true },
  });

  if (!user.profile) {
    await prisma.playerProfile.create({ data: { userId: user.id } });
  }

  return user;
}

/** Сообщение для тех, у кого Telegram не привязан к аккаунту */
export const TELEGRAM_NOT_LINKED =
  "Этот Telegram не привязан к аккаунту СТАРТ+. Войдите по логину и паролю от тренера и привяжите Telegram в профиле.";

export function normalizeBotUsername(raw: string | undefined | null): string {
  return (raw || "").trim().replace(/^@/, "");
}
