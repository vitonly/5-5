import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { seasonPlayerIds } from "@/lib/season-participants";
import { requireAdmin } from "@/lib/session";
import { notifyChatId, sendTelegramMessage } from "@/lib/telegram";
import { displayName } from "@/lib/utils";
import { sendTelegramTestToAdmin } from "@/lib/tg-test";
import { recipientFilter } from "@/lib/recipients";
import { handleAuth } from "@/lib/api-auth";

function missingTargets(
  voterId: string,
  studentIds: string[],
  peerRatings: { raterId: string; targetId: string }[],
  vibeVotes: { voterId: string; targetId: string }[]
) {
  const others = studentIds.filter((id) => id !== voterId);
  const skillDone = new Set(
    peerRatings.filter((r) => r.raterId === voterId).map((r) => r.targetId)
  );
  const vibeDone = new Set(
    vibeVotes.filter((v) => v.voterId === voterId).map((v) => v.targetId)
  );
  return others.filter((id) => !skillDone.has(id) || !vibeDone.has(id));
}

async function postHandler(request: NextRequest) {
  const admin = await requireAdmin();
  const body = await request.json().catch(() => ({}));
  const { seasonId, voterId, allIncomplete, testToAdmin } = body as {
    seasonId?: string;
    voterId?: string;
    allIncomplete?: boolean;
    testToAdmin?: boolean;
  };

  if (!seasonId) {
    return NextResponse.json({ error: "Укажите seasonId" }, { status: 400 });
  }

  const season = await prisma.ratingSeason.findUnique({
    where: { id: seasonId },
    include: {
      peerRatings: { select: { raterId: true, targetId: true } },
      vibeVotes: { select: { voterId: true, targetId: true } },
    },
  });
  if (!season) {
    return NextResponse.json({ error: "Сезон не найден" }, { status: 404 });
  }
  if (season.status !== "OPEN") {
    return NextResponse.json({ error: "Сезон закрыт — голосование не идёт" }, { status: 400 });
  }

  // Участники голосования: выбранные ученики (или все) и тренер
  const studentIds = await seasonPlayerIds(season);
  // Напоминаем только ученикам-участникам
  const students = await prisma.user.findMany({
    where: { role: "STUDENT", id: { in: studentIds } },
    orderBy: { firstName: "asc" },
  });

  const incompleteVoters = students.filter(
    (s) =>
      missingTargets(s.id, studentIds, season.peerRatings, season.vibeVotes).length > 0
  );

  // Выбрали группу или отдельных учеников — напоминаем только им
  const only = recipientFilter(body);
  const targets = allIncomplete
    ? incompleteVoters.filter((s) => !only || only.has(s.id))
    : incompleteVoters.filter((s) => s.id === voterId);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "";
  const voteUrl = appUrl ? `${appUrl}/match/vote` : "/match/vote";

  const sampleMissing = targets[0]
    ? missingTargets(targets[0].id, studentIds, season.peerRatings, season.vibeVotes).length
    : 1;

  const sampleText = `📢 <b>Напоминание о голосовании</b>

У вас не оценено игроков: <b>${sampleMissing}</b> из ${Math.max(studentIds.length - 1, 0)}.

Нужно выставить оценку силы (0–100) и тильт каждому.

Откройте: <a href="${voteUrl}">${voteUrl}</a>`;

  if (testToAdmin) {
    try {
      await sendTelegramTestToAdmin(admin.id, sampleText);
      return NextResponse.json({ success: true, test: true });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Ошибка теста" },
        { status: 400 }
      );
    }
  }

  if (!targets.length) {
    return NextResponse.json(
      {
        error: allIncomplete
          ? "Все уже проголосовали полностью"
          : "Ученик не найден или уже всё оценил",
      },
      { status: 400 }
    );
  }

  let sent = 0;
  let skipped = 0;
  const failed: string[] = [];

  for (const student of targets) {
    const missing = missingTargets(
      student.id,
      studentIds,
      season.peerRatings,
      season.vibeVotes
    );
    const chatId = notifyChatId(student);
    if (!chatId) {
      skipped++;
      failed.push(displayName(student));
      continue;
    }

    const text = `📢 <b>Напоминание о голосовании</b>

У вас не оценено игроков: <b>${missing.length}</b> из ${studentIds.length - 1}.

Нужно выставить оценку силы (0–100) и тильт каждому.

Откройте: <a href="${voteUrl}">${voteUrl}</a>`;

    const ok = await sendTelegramMessage(chatId, text);
    if (ok) sent++;
    else {
      skipped++;
      failed.push(displayName(student));
    }
  }

  return NextResponse.json({ sent, skipped, failed });
}

// Нет входа / нет прав — ответ 401 / 403, а не «ошибка сервера»
export const POST = handleAuth(postHandler);
