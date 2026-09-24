import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { hasIncompleteRoles } from "@/lib/secondary-roles";
import { notifyChatId, sendTelegramMessage } from "@/lib/telegram";
import { displayName } from "@/lib/utils";

const REMIND_TEXT = `⚠️ <b>Заполните роли в профиле</b>

Нужно указать <b>основную</b> роль и хотя бы одну <b>дополнительную</b> — без этого нельзя нормально собирать 5v5.

Откройте сайт → Профиль → выберите роли и сохраните.`;

export async function POST(request: NextRequest) {
  await requireAdmin();
  const body = await request.json().catch(() => ({}));
  const { userId, allIncomplete } = body as {
    userId?: string;
    allIncomplete?: boolean;
  };

  const students = await prisma.user.findMany({
    where: { role: "STUDENT" },
    include: { profile: true },
  });

  const targets = allIncomplete
    ? students.filter((s) => hasIncompleteRoles(s.profile))
    : students.filter((s) => s.id === userId && hasIncompleteRoles(s.profile));

  if (!targets.length) {
    return NextResponse.json(
      { error: allIncomplete ? "Некого напоминать" : "Ученик не найден или роли уже заполнены" },
      { status: 400 }
    );
  }

  let sent = 0;
  let skipped = 0;
  const failed: string[] = [];

  for (const student of targets) {
    const chatId = notifyChatId(student);
    if (!chatId) {
      skipped++;
      failed.push(displayName(student));
      continue;
    }
    const ok = await sendTelegramMessage(chatId, REMIND_TEXT);
    if (ok) sent++;
    else {
      skipped++;
      failed.push(displayName(student));
    }
  }

  return NextResponse.json({ sent, skipped, failed });
}
