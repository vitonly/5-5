import { prisma } from "@/lib/db";

/** Зафиксировать согласие на обработку ПД, если ещё не было. */
export async function recordPdConsent(userId: string) {
  await prisma.user.updateMany({
    where: { id: userId, pdConsentAt: null },
    data: { pdConsentAt: new Date() },
  });
}
