import crypto from "crypto";

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export function validateTelegramAuth(data: TelegramUser, botToken: string): boolean {
  const { hash, ...rest } = data;
  if (!hash) return false;

  const authDate = rest.auth_date;
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > 86400) return false;

  const checkString = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${rest[key as keyof typeof rest]}`)
    .join("\n");

  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  const hmac = crypto.createHmac("sha256", secretKey).update(checkString).digest("hex");

  return hmac === hash;
}
