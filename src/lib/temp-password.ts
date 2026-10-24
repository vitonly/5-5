import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "crypto";
import { prisma } from "@/lib/db";

/**
 * Временный пароль ученика (тот, что тренер задал и ещё не разослал в Telegram).
 *
 * Хранить его открытым текстом нельзя: утечка базы сразу раскрыла бы пароли детей.
 * Поэтому храним зашифрованным (AES-256-GCM). Ключ не лежит в базе — он вычисляется
 * из секрета сайта JWT_SECRET, который есть только в .env на сервере.
 *
 * Формат в базе: "enc1:<iv>.<tag>.<шифротекст>" (base64url).
 * Если секрет сайта сменится, старые временные пароли не расшифруются —
 * тогда тренер просто задаёт пароль ученику заново.
 */
const PREFIX = "enc1:";

function key(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  // Отдельный ключ для паролей: из секрета сайта, но не сам секрет
  return createHmac("sha256", secret).update("login-temp-password").digest();
}

/** Зашифровать пароль для записи в базу */
export function sealTempPassword(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, data].map((b) => b.toString("base64url")).join(".");
}

/** Достать пароль из базы. null — не удалось расшифровать (например, сменился секрет сайта). */
export function openTempPassword(stored: string): string | null {
  if (!stored.startsWith(PREFIX)) return stored;   // старая запись, сделанная до шифрования
  try {
    const [iv, tag, data] = stored.slice(PREFIX.length).split(".").map((s) => Buffer.from(s, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Зашифровать временные пароли, которые ещё лежат открытым текстом (записаны до этого изменения).
 * Вызывается из ежечасной автоматизации; повторный запуск ничего не меняет.
 */
export async function sealPlainTempPasswords(): Promise<number> {
  const users = await prisma.user.findMany({
    where: { loginPasswordTemp: { not: null }, NOT: { loginPasswordTemp: { startsWith: PREFIX } } },
    select: { id: true, loginPasswordTemp: true },
  });
  for (const u of users) {
    await prisma.user.update({
      where: { id: u.id },
      data: { loginPasswordTemp: sealTempPassword(u.loginPasswordTemp!) },
    });
  }
  return users.length;
}
