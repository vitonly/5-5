import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { formatDate, displayName } from "@/lib/utils";
import { sendTelegramMessage, notifyChatId } from "@/lib/telegram";
import { sendTelegramTestToAdmin } from "@/lib/tg-test";

/** Статусы, где ученик ещё должен что-то сдать / доработать */
const REMINDABLE = ["ASSIGNED", "OVERDUE", "REVISION"] as const;

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function remindText(title: string, deadline: Date) {
  return `⏰ <b>Напоминание о домашке!</b>\n\n<b>${escapeHtml(title)}</b>\nСрок сдачи: ${escapeHtml(formatDate(deadline))}\n\nНе забудьте сдать вовремя, чтобы не получить штраф!`;
}

function remindBundleText(
  items: { title: string; deadline: Date }[]
) {
  if (items.length === 1) return remindText(items[0].title, items[0].deadline);
  const lines = items.map(
    (it, i) =>
      `${i + 1}. <b>${escapeHtml(it.title)}</b> — срок: ${escapeHtml(formatDate(it.deadline))}`
  );
  return `⏰ <b>Напоминание о домашках!</b>\n\nУ вас незакрытых заданий: <b>${items.length}</b>\n\n${lines.join("\n")}\n\nНе забудьте сдать вовремя, чтобы не получить штраф!`;
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  const body = await request.json().catch(() => ({}));
  const { assignmentId, allIncomplete, testToAdmin } = body as {
    assignmentId?: string;
    allIncomplete?: boolean;
    testToAdmin?: boolean;
  };

  if (allIncomplete) {
    const assignments = await prisma.homeworkAssignment.findMany({
      where: { status: { in: [...REMINDABLE] } },
      include: { homework: true, student: true },
      orderBy: { deadline: "asc" },
    });

    if (assignments.length === 0) {
      return NextResponse.json({ error: "Некого напоминать — нет незакрытых домашек" }, { status: 400 });
    }

    // одно сообщение на ученика со списком его домашек
    const byStudent = new Map<string, typeof assignments>();
    for (const a of assignments) {
      const list = byStudent.get(a.studentId) ?? [];
      list.push(a);
      byStudent.set(a.studentId, list);
    }

    if (testToAdmin) {
      const sample = [...byStudent.values()][0]!;
      const text = remindBundleText(
        sample.map((a) => ({
          title: a.homework.title,
          deadline: a.revisionDeadline ?? a.deadline,
        }))
      );
      try {
        await sendTelegramTestToAdmin(admin.id, text);
        return NextResponse.json({
          success: true,
          test: true,
          targets: byStudent.size,
          assignments: assignments.length,
        });
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Ошибка теста" },
          { status: 400 }
        );
      }
    }

    let sent = 0;
    let skipped = 0;
    const failed: string[] = [];

    for (const group of byStudent.values()) {
      const student = group[0]!.student;
      const chatId = notifyChatId(student);
      if (!chatId) {
        skipped++;
        failed.push(displayName(student));
        continue;
      }
      const text = remindBundleText(
        group.map((a) => ({
          title: a.homework.title,
          deadline: a.revisionDeadline ?? a.deadline,
        }))
      );
      const ok = await sendTelegramMessage(chatId, text);
      if (ok) sent++;
      else {
        skipped++;
        failed.push(displayName(student));
      }
    }

    return NextResponse.json({
      sent,
      skipped,
      failed,
      assignments: assignments.length,
    });
  }

  const assignment = await prisma.homeworkAssignment.findUnique({
    where: { id: assignmentId },
    include: { homework: true, student: true },
  });

  if (!assignment) {
    return NextResponse.json({ error: "Задание не найдено" }, { status: 404 });
  }

  const text = remindText(
    assignment.homework.title,
    assignment.revisionDeadline ?? assignment.deadline
  );

  if (testToAdmin) {
    try {
      await sendTelegramTestToAdmin(admin.id, text);
      return NextResponse.json({ success: true, test: true });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Ошибка теста" },
        { status: 400 }
      );
    }
  }

  const sent = await sendTelegramMessage(notifyChatId(assignment.student), text);
  return NextResponse.json({ success: true, delivered: sent });
}
