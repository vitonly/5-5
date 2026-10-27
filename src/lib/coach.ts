import { prisma } from "@/lib/db";

/**
 * Тренер тоже играет в субботних 5на5, и ученики оценивают его силу и тильт.
 * Но награды он у детей не забирает: очки за игры, MVP дня и рекорды
 * зала славы — только ученикам.
 */

/** Кто может быть игроком 5на5 и кого можно оценивать: ученики и тренер */
export const PLAYER_ROLES: ("STUDENT" | "ADMIN")[] = ["STUDENT", "ADMIN"];

/** id всех тренеров — чтобы не начислять им награды */
export async function getCoachIds(): Promise<Set<string>> {
  const coaches = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  return new Set(coaches.map((c) => c.id));
}
