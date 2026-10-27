import { prisma } from "@/lib/db";
import { applyHomeworkOverduePenalty, recalculateAllMatchWinPoints } from "@/lib/points";
import { finalizeSeason, closeVoting, migrateLegacySeasonDeadlines } from "@/lib/seasons";
import { formatDate } from "@/lib/utils";
import { notifyChatId, sendTelegramMessage, escapeTelegramHtml as escapeHtml } from "@/lib/telegram";
import { processMvpDeadlines } from "@/lib/match-mvp";
import { checkAllAchievements } from "@/lib/achievements";
import { snapshotRatings } from "@/lib/rating-history";
import { syncHallPoints } from "@/lib/hall-of-fame";
import { syncAllStudentsProgressFromOpenDota } from "@/lib/progress-opendota";
import { sealPlainTempPasswords } from "@/lib/temp-password";

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
    await applyHomeworkOverduePenalty(assignment.studentId, assignment.homework.title, assignment.id);
    await sendTelegramMessage(
      notifyChatId(assignment.student),
      `⚠️ <b>Просрочена домашка</b>\n\n<b>${assignment.homework.title}</b>\nСрок был: ${formatDate(assignment.deadline)}\n\nШтраф начислен.`
    );
    count++;
  }

  return count;
}

const HOUR = 60 * 60 * 1000;


/**
 * Автонапоминания о домашке: за сутки и за 2 часа до срока.
 * Автоматизация запускается раз в час, поэтому «за сутки» придёт за 23–24 часа,
 * а «за 2 часа» — за 1–2 часа до срока. Что уже отправлено, помним в remindedDayAt / remindedHourAt.
 * Только что выданную домашку не дёргаем: ученик и так получил «Новая домашка».
 */
export async function processHomeworkReminders() {
  const now = Date.now();
  const open = await prisma.homeworkAssignment.findMany({
    where: {
      status: { in: ["ASSIGNED", "REVISION"] },
      submission: null,
      OR: [{ remindedDayAt: null }, { remindedHourAt: null }],
    },
    include: { homework: true, student: true },
  });

  let sent = 0;
  for (const a of open) {
    // У доработки свой срок
    const deadline = a.status === "REVISION" && a.revisionDeadline ? a.revisionDeadline : a.deadline;
    const left = deadline.getTime() - now;
    if (left <= 0) continue;                                  // просрочку обработает processOverdueHomework
    const age = now - a.createdAt.getTime();
    const title = escapeHtml(a.homework.title);
    const when = escapeHtml(formatDate(deadline));

    if (left <= 2 * HOUR && !a.remindedHourAt) {
      // Отмечаем сразу, даже если Telegram не привязан, — чтобы не пытаться каждый час
      await prisma.homeworkAssignment.update({
        where: { id: a.id },
        data: { remindedHourAt: new Date(), remindedDayAt: a.remindedDayAt ?? new Date() },
      });
      if (age < HOUR) continue;
      const ok = await sendTelegramMessage(
        notifyChatId(a.student),
        `⏳ <b>Осталось меньше 2 часов!</b>\n\n<b>${title}</b>\nСрок сдачи: ${when}\n\nУспейте сдать, чтобы не получить штраф.`
      );
      if (ok) sent++;
    } else if (left <= 24 * HOUR && left > 2 * HOUR && !a.remindedDayAt) {
      await prisma.homeworkAssignment.update({ where: { id: a.id }, data: { remindedDayAt: new Date() } });
      if (age < 3 * HOUR) continue;
      const ok = await sendTelegramMessage(
        notifyChatId(a.student),
        `⏰ <b>До сдачи домашки меньше суток</b>\n\n<b>${title}</b>\nСрок сдачи: ${when}\n\nНе откладывайте — сдайте сегодня.`
      );
      if (ok) sent++;
    }
  }
  return sent;
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

/** Удалить тикеты входа через бота, просроченные больше суток назад: они уже никому не нужны */
export async function cleanupLoginTickets() {
  const { count } = await prisma.loginTicket.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 24 * HOUR) } },
  });
  return count;
}

export async function runAutomation() {
  await migrateLegacySeasonDeadlines();
  // Временные пароли, записанные открытым текстом до шифрования, — шифруем
  const tempPasswordsSealed = await sealPlainTempPasswords().catch((e) => {
    console.error("[automation] temp passwords", e);
    return 0;
  });
  const loginTicketsDeleted = await cleanupLoginTickets().catch((e) => {
    console.error("[automation] login tickets", e);
    return 0;
  });
  const overdueProcessed = await processOverdueHomework();
  const homeworkReminders = await processHomeworkReminders().catch((e) => {
    console.error("[automation] homework reminders", e);
    return 0;
  });
  // Сверка очков за победы 5v5 (бонус роли по итоговому составу игры).
  // Раньше запускалась при каждом открытии страницы «Субботние 5v5»
  const matchWinPointsFixed = await recalculateAllMatchWinPoints().catch((e) => {
    console.error("[automation] match win points", e);
    return 0;
  });
  const votingClosed = await processExpiredVoting();
  const seasonsClosed = await processExpiredSeasons();
  const mvpClosed = await processMvpDeadlines();
  const snapshots = await snapshotRatings().catch((e) => {
    console.error("[automation] snapshots", e);
    return 0;
  });
  const achievementsUnlocked = await checkAllAchievements().catch((e) => {
    console.error("[automation] achievements", e);
    return 0;
  });

  const hall = await syncHallPoints().catch((e) => {
    console.error("[automation] hall of fame", e);
    return { changed: 0 };
  });

  const progressDota = await syncAllStudentsProgressFromOpenDota().catch((e) => {
    console.error("[automation] progress opendota", e);
    return { students: 0, synced: 0, privateCount: 0, errors: [String(e)] };
  });

  return {
    hallChanged: hall.changed,
    overdueProcessed,
    tempPasswordsSealed,
    loginTicketsDeleted,
    homeworkReminders,
    matchWinPointsFixed,
    votingClosed,
    seasonsClosed,
    mvpClosed,
    snapshots,
    achievementsUnlocked,
    progressDota,
    ranAt: new Date().toISOString(),
  };
}
