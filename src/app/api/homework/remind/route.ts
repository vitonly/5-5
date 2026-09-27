import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { formatDate } from "@/lib/utils";
import { sendTelegramMessage, notifyChatId } from "@/lib/telegram";
import { sendTelegramTestToAdmin } from "@/lib/tg-test";

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  const body = await request.json();
  const { assignmentId, testToAdmin } = body as {
    assignmentId?: string;
    testToAdmin?: boolean;
  };

  const assignment = await prisma.homeworkAssignment.findUnique({
    where: { id: assignmentId },
    include: { homework: true, student: true },
  });

  if (!assignment) {
    return NextResponse.json({ error: "Задание не найдено" }, { status: 404 });
  }

  const text = `⏰ <b>Напоминание о домашке!</b>\n\n<b>${assignment.homework.title}</b>\nСрок сдачи: ${formatDate(assignment.deadline)}\n\nНе забудьте сдать вовремя, чтобы не получить штраф!`;

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
