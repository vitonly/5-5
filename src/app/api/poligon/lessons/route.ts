/*
 * Полигон: отметить урок прочитанным (или снять отметку).
 * POST { lessonId, done }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { handleAuth } from "@/lib/api-auth";
import { canUsePoligon } from "@/lib/poligon/core";

async function postHandler(request: NextRequest) {
  const user = await requireUser();
  if (!canUsePoligon(user)) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { lessonId?: string; done?: boolean };
  const lessonId = String(body.lessonId ?? "").slice(0, 64);
  if (!lessonId) return NextResponse.json({ error: "Нет урока" }, { status: 400 });

  if (body.done === false) {
    await prisma.poligonLessonDone.deleteMany({ where: { userId: user.id, lessonId } });
  } else {
    await prisma.poligonLessonDone.upsert({
      where: { userId_lessonId: { userId: user.id, lessonId } },
      create: { userId: user.id, lessonId },
      update: {},
    });
  }
  return NextResponse.json({ ok: true });
}

export const POST = handleAuth(postHandler);
