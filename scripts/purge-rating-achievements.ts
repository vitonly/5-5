/**
 * Удалить ачивки категории «Рейтинг» (podium / rise / from_basement),
 * откатить начисленные за них очки и убрать записи из истории.
 *
 *   npx tsx scripts/purge-rating-achievements.ts          — проверка
 *   npx tsx scripts/purge-rating-achievements.ts --apply  — применить
 */
import { prisma } from "../src/lib/db";
import { removePointsBySource, roundPoints } from "../src/lib/points";

const CODES = ["podium", "rise", "from_basement"] as const;

async function main() {
  const apply = process.argv.includes("--apply");
  const rows = await prisma.userAchievement.findMany({
    where: { code: { in: [...CODES] } },
    include: { user: { select: { id: true, firstName: true, lastName: true, username: true } } },
    orderBy: [{ code: "asc" }, { tier: "asc" }],
  });

  console.log(
    apply
      ? `Удаляю ${rows.length} ачивок рейтинга…`
      : `ПРОВЕРКА: найдено ${rows.length} ачивок рейтинга (без записи)`
  );

  let pointsTotal = 0;
  for (const row of rows) {
    const name = [row.user.firstName, row.user.lastName, row.user.username].filter(Boolean).join(" ");
    const pts = roundPoints(row.pointsAwarded);
    pointsTotal += pts;
    console.log(`  ${name} · ${row.code} t${row.tier} · ${pts} очк.`);
    if (!apply) continue;
    await removePointsBySource(row.userId, "ACHIEVEMENT", `${row.code}:${row.tier}`);
    await prisma.userAchievement.delete({ where: { id: row.id } });
  }

  const leftover = await prisma.pointLog.findMany({
    where: {
      OR: [
        { sourceId: { startsWith: "podium:" } },
        { sourceId: { startsWith: "rise:" } },
        { sourceId: { startsWith: "from_basement:" } },
        { reason: { startsWith: "Ачивка: «Призёр" } },
        { reason: { startsWith: "Ачивка: «Рывок" } },
        { reason: { startsWith: "Ачивка: «Из подвала" } },
      ],
    },
  });
  if (leftover.length) {
    console.log(`\nОставшиеся pointLog: ${leftover.length}`);
    for (const log of leftover) {
      console.log(`  ${log.userId} · ${log.reason} · ${log.delta}`);
      if (!apply) continue;
      await prisma.$transaction([
        prisma.pointLog.delete({ where: { id: log.id } }),
        prisma.playerProfile.update({
          where: { userId: log.userId },
          data: { totalPoints: { increment: -roundPoints(log.delta) } },
        }),
      ]);
    }
  }

  console.log(
    apply
      ? `\nГотово. Отозвано ачивок: ${rows.length}, очков (по pointsAwarded): ${roundPoints(pointsTotal)}`
      : `\nВсего очков к отзыву (по pointsAwarded): ${roundPoints(pointsTotal)}. Запусти с --apply.`
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
