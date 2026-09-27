import { prisma } from "@/lib/db";
import { applyHomeworkOverduePenalty } from "@/lib/points";
import { finalizeSeason, closeVoting, migrateLegacySeasonDeadlines } from "@/lib/seasons";
import { formatDate } from "@/lib/utils";
import { notifyChatId, sendTelegramMessage } from "@/lib/telegram";

export async function processOverdueHomework() {
  const now = new Date();
  const overdue = await prisma.homeworkAssignment.findMany({
    where: {
      OR: [
        { status: "ASSIGNED", deadline: { lt: now } },
        { status: "REVISION", revisionDeadline: { lt: now } },
      ],
    },
    include: {
      homework: true,
      student: true,
    },
  });

  let count = 0;
  for (const assignment of overdue) {
    await prisma.homeworkAssignment.update({
      where: { id: assignment.id },
      data: { status: "OVERDUE" },
    });
    await applyHomeworkOverduePenalty(assignment.studentId, assignment.homework.title);
    await sendTelegramMessage(
      notifyChatId(assignment.student),
      `⚠️ <b>Просрочена домашка</b>\n\n<b>${assignment.homework.title}</b>\nСрок был: ${formatDate(assignment.deadline)}\n\nШтраф начислен. Сдайте как можно скорее.`
    );
    count++;
  }

  return count;
}

export async function processExpiredVoting() {
  const now = new Date();
  const expired = await prisma.ratingSeason.findMany({
    where: {
      status: "OPEN",
      votingClosesAt: { lte: now },
    },
  });

  const closed: string[] = [];
  for (const season of expired) {
    await closeVoting(season.id);
    closed.push(season.id);
  }

  return closed.length;
}

export async function processExpiredSeasons() {
  const now = new Date();
  const expired = await prisma.ratingSeason.findMany({
    where: {
      isActive: true,
      closesAt: { lte: now },
    },
  });

  const closed: string[] = [];
  for (const season of expired) {
    await finalizeSeason(season.id);
    closed.push(season.id);
  }

  return closed.length;
}

export async function runAutomation() {
  await migrateLegacySeasonDeadlines();
  const overdueProcessed = await processOverdueHomework();
  const votingClosed = await processExpiredVoting();
  const seasonsClosed = await processExpiredSeasons();

  return {
    overdueProcessed,
    votingClosed,
    seasonsClosed,
    ranAt: new Date().toISOString(),
  };
}
