/*
 * Профессионалы: сдать блиц по модулю.
 * POST { moduleCode, answers: { [id вопроса]: номер варианта } } → { correct, total, wrongIds }
 * Проверяем на сервере и сохраняем результат — тренер видит его в админке и в карте ошибок.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { handleAuth } from "@/lib/api-auth";
import { canUsePoligon, isModuleCode } from "@/lib/poligon/core";
import { QUIZ } from "@/content/poligon/quiz";

async function postHandler(request: NextRequest) {
  const user = await requireUser();
  if (!canUsePoligon(user)) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { moduleCode?: string; answers?: Record<string, unknown> };
  const code = String(body.moduleCode ?? "");
  const questions = isModuleCode(code) ? QUIZ[code] : undefined;
  if (!questions) return NextResponse.json({ error: "Блица для этого модуля нет" }, { status: 404 });

  const answers = body.answers && typeof body.answers === "object" ? body.answers : {};
  const wrongIds = questions.filter((q) => answers[q.id] !== q.answer).map((q) => q.id);
  const correct = questions.length - wrongIds.length;
  await prisma.poligonQuizResult.create({
    data: { userId: user.id, moduleCode: code, correct, total: questions.length, wrongIds: JSON.stringify(wrongIds) },
  });
  return NextResponse.json({ correct, total: questions.length, wrongIds });
}

export const POST = handleAuth(postHandler);
