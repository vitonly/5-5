import { prisma } from "@/lib/db";

/**
 * «Замороженная» сила игроков 5на5.
 *
 * Как только составы собраны, сила каждого игрока записывается в сессию (MatchSession.powerSnapshot).
 * Дальше до конца игр всё считается по ней: баланс и пересборка, «Сумма силы», название команды,
 * прогнозы и очки за победу. Поэтому если ученик посреди дня поменяет себе ранг или получит
 * новые оценки, составы и очки этого дня не «поедут».
 * Игрок, попавший в состав позже (из очереди), замораживается в момент попадания.
 */

export { parsePowerSnapshot, withSnapshot, type PowerMap } from "@/lib/match-power-snapshot";
import { parsePowerSnapshot, type PowerMap } from "@/lib/match-power-snapshot";

/**
 * Заморозить силу игроков сессии: кого ещё нет в снимке — записать текущую силу из профиля.
 * Уже замороженных не трогаем. Возвращает силу для всех переданных игроков.
 */
export async function lockSessionPower(sessionId: string, userIds: string[]): Promise<PowerMap> {
  const session = await prisma.matchSession.findUnique({
    where: { id: sessionId },
    select: { powerSnapshot: true },
  });
  const snapshot = parsePowerSnapshot(session?.powerSnapshot);
  const missing = userIds.filter((id) => snapshot[id] === undefined);
  if (missing.length) {
    const profiles = await prisma.playerProfile.findMany({
      where: { userId: { in: missing } },
      select: { userId: true, finalRating: true },
    });
    for (const p of profiles) snapshot[p.userId] = p.finalRating;
    await prisma.matchSession.update({
      where: { id: sessionId },
      data: { powerSnapshot: JSON.stringify(snapshot) },
    });
  }
  return Object.fromEntries(userIds.map((id) => [id, snapshot[id] ?? 0]));
}

/**
 * Тренер нажал «Обновить силу»: взять у всех игроков сессии текущую силу из профилей.
 * Можно только до старта игр — потом сила должна остаться той, с которой собирали составы.
 */
export async function refreshSessionPower(sessionId: string): Promise<PowerMap> {
  const session = await prisma.matchSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new Error("Сессия не найдена");
  if (session.status === "IN_PROGRESS" || session.status === "COMPLETED") {
    throw new Error("Игры уже начались — сила зафиксирована до конца дня");
  }
  await prisma.matchSession.update({ where: { id: sessionId }, data: { powerSnapshot: "{}" } });
  const ids = Object.keys(parsePowerSnapshot(session.powerSnapshot));
  return ids.length ? lockSessionPower(sessionId, ids) : {};
}
