/*
 * Полигон, тренер: сохранить оценки попытки и открыть отчёт ученику.
 * PATCH { scores, good, improve, nextSteps, publish?: boolean }
 * DELETE — удалить попытку (например, пробную).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { handleAuth } from "@/lib/api-auth";
import {
  fmtPoints,
  getModule,
  getVariant,
  isModuleCode,
  taskResults,
  totalOf,
  variantTasks,
  type ScoresMap,
} from "@/lib/poligon/core";
import { absolutePublicUrl, escapeTelegramHtml, notifyChatId, sendTelegramMessage } from "@/lib/telegram";

/** Оставляем только оценки по аспектам этого варианта и только числа */
function cleanScores(raw: unknown, allowed: Set<string>): ScoresMap {
  const out: ScoresMap = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed.has(id) || !v || typeof v !== "object") continue;
    const val = (v as { value?: unknown }).value;
    const comment = String((v as { comment?: unknown }).comment ?? "").slice(0, 2000);
    const num = typeof val === "number" && Number.isFinite(val) ? val : null;
    out[id] = { value: num, comment };
  }
  return out;
}

async function patchHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const attempt = await prisma.poligonAttempt.findUnique({
    where: { id },
    include: { user: { select: { telegramChatId: true, telegramId: true } } },
  });
  if (!attempt) return NextResponse.json({ error: "Попытка не найдена" }, { status: 404 });
  const mod = getModule(attempt.moduleCode);
  const variant = mod ? getVariant(mod, attempt.variantId) : null;
  if (!mod || !variant || !isModuleCode(attempt.moduleCode)) {
    return NextResponse.json({ error: "Задание больше не существует" }, { status: 404 });
  }

  const tasks = variantTasks(attempt.moduleCode, variant);
  const allowed = new Set(tasks.flatMap((t) => t.aspects.map((a) => a.id)));
  const body = (await request.json().catch(() => ({}))) as {
    scores?: unknown;
    good?: unknown;
    improve?: unknown;
    nextSteps?: unknown;
    publish?: unknown;
  };
  const scores = cleanScores(body.scores, allowed);
  const publish = body.publish === true;
  const firstPublish = publish && !attempt.publishedAt;
  const now = new Date();

  await prisma.poligonAttempt.update({
    where: { id },
    data: {
      scores: JSON.stringify(scores),
      good: String(body.good ?? "").slice(0, 10_000),
      improve: String(body.improve ?? "").slice(0, 10_000),
      nextSteps: String(body.nextSteps ?? "").slice(0, 10_000),
      gradedAt: now,
      // Если ученик так и не нажал «Сдать», а тренер проверяет — считаем сданной
      submittedAt: attempt.submittedAt ?? now,
      ...(publish ? { status: "GRADED", publishedAt: attempt.publishedAt ?? now } : {}),
    },
  });

  // Ученику — сообщение, что отчёт готов (только в первый раз)
  if (firstPublish) {
    const total = totalOf(taskResults(tasks, scores));
    const link = absolutePublicUrl(`/poligon/attempt/${id}`) ?? `/poligon/attempt/${id}`;
    await sendTelegramMessage(
      notifyChatId(attempt.user),
      `🧪 Проверено: <b>${escapeTelegramHtml(`Модуль ${mod.letter} — ${variant.title}`)}</b>\n` +
        `Баллы: ${fmtPoints(total.points)} из ${fmtPoints(total.max)}\n` +
        `Разбор и что подтянуть: ${link}`
    ).catch(() => false);
  }

  return NextResponse.json({ ok: true });
}

async function deleteHandler(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  await prisma.poligonAttempt.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}

export const PATCH = handleAuth(patchHandler);
export const DELETE = handleAuth(deleteHandler);
