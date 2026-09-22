import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { formatDate } from "@/lib/utils";
import { sendTelegramMessage, notifyChatId } from "@/lib/telegram";

export async function POST(request: NextRequest) {
  await requireAdmin();
  const { assignmentId } = await request.json();

  const assignment = await prisma.homeworkAssignment.findUnique({
    where: { id: assignmentId },
    include: { homework: true, student: true },
  });

  if (!assignment) {
    return NextResponse.json({ error: "Задание не найдено" }, { status: 404 });
  }

  const sent = await sendTelegramMessage(
    notifyChatId(assignment.student),
    `⏰ <b>Напоминание о домашке!</b>\n\n<b>${assignment.homework.title}</b>\nСрок сдачи: ${formatDate(assignment.deadline)}\n\nНе забудьте сдать вовремя, чтобы не получить штраф!`
  );

  return NextResponse.json({ success: true, delivered: sent });
}
