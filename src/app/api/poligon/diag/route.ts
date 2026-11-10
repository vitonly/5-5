/*
 * Профессионалы: входная диагностика ученика.
 * PUT  { answers } — сохранить черновик (вызывается сам, пока ученик отвечает)
 * POST { answers } — отправить тест. После отправки менять ответы нельзя — сбросить может только тренер.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { handleAuth } from "@/lib/api-auth";
import { canUsePoligon } from "@/lib/poligon/core";
import { cleanDiagAnswers } from "@/content/poligon/diag";

/** Общая часть: проверить доступ, прочитать ответы, не дать править отправленный тест */
async function prepare(request: NextRequest) {
  const user = await requireUser();
  if (!canUsePoligon(user)) return { ok: false as const, error: NextResponse.json({ error: "Нет доступа" }, { status: 403 }) };
  const body = (await request.json().catch(() => ({}))) as { answers?: unknown };
  const answers = cleanDiagAnswers(body.answers);
  const existing = await prisma.poligonDiag.findUnique({ where: { userId: user.id } });
  if (existing?.status === "SUBMITTED") {
    return { ok: false as const, error: NextResponse.json({ error: "Тест уже отправлен" }, { status: 409 }) };
  }
  return { ok: true as const, user, answers, existing };
}

async function putHandler(request: NextRequest) {
  const r = await prepare(request);
  if (!r.ok) return r.error;
  await prisma.poligonDiag.upsert({
    where: { userId: r.user.id },
    create: { userId: r.user.id, answers: JSON.stringify(r.answers) },
    update: { answers: JSON.stringify(r.answers) },
  });
  return NextResponse.json({ ok: true });
}

async function postHandler(request: NextRequest) {
  const r = await prepare(request);
  if (!r.ok) return r.error;
  const now = new Date();
  // Время считаем от создания черновика (первого сохранённого ответа)
  const startedAt = r.existing?.startedAt ?? now;
  const minutes = Math.max(1, Math.round((now.getTime() - startedAt.getTime()) / 60_000));
  await prisma.poligonDiag.upsert({
    where: { userId: r.user.id },
    create: { userId: r.user.id, answers: JSON.stringify(r.answers), status: "SUBMITTED", submittedAt: now, minutes },
    update: { answers: JSON.stringify(r.answers), status: "SUBMITTED", submittedAt: now, minutes },
  });
  return NextResponse.json({ ok: true });
}

export const PUT = handleAuth(putHandler);
export const POST = handleAuth(postHandler);
