import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";

export function generateTelegramLinkToken(): string {
  return randomBytes(16).toString("hex");
}

export async function ensureTelegramLinkToken(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");
  if (user.telegramLinkToken) return user.telegramLinkToken;

  const token = generateTelegramLinkToken();
  await prisma.user.update({
    where: { id: userId },
    data: { telegramLinkToken: token },
  });
  return token;
}

export function isTelegramLinked(user: {
  telegramChatId?: string | null;
  telegramId?: string | null;
}) {
  return Boolean(user.telegramChatId);
}
