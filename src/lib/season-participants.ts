import { prisma } from "@/lib/db";
import { parseParticipantIds } from "@/lib/season-participant-ids";

export { parseParticipantIds };

/**
 * Участники сезонного голосования.
 * Тренер может выбрать, кто голосует и кого оценивают (группой или поштучно), —
 * чтобы ученикам не попадались ребята, с которыми они не играют.
 * Пустой список — участвуют все ученики (как было раньше). Тренер участвует всегда.
 */

/** id всех участников голосования сезона: выбранные ученики (или все) + тренеры */
export async function seasonPlayerIds(season: { participantIds: string }): Promise<string[]> {
  const only = parseParticipantIds(season.participantIds);
  const users = await prisma.user.findMany({
    where: only.length
      ? { OR: [{ role: "ADMIN" }, { role: "STUDENT", id: { in: only } }] }
      : { role: { in: ["STUDENT", "ADMIN"] } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}
