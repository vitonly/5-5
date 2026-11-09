/*
 * Полигон: начать попытку задания.
 * POST { moduleCode, variantId } → { id }
 * Режим берём из варианта: тренировочное — мягкий таймер, «как на чемпионате» — жёсткий.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { handleAuth } from "@/lib/api-auth";
import { canUsePoligon, getModule, getVariant } from "@/lib/poligon/core";

async function postHandler(request: NextRequest) {
  const user = await requireUser();
  if (!canUsePoligon(user)) return NextResponse.json({ error: "Раздел «Профессионалы» тебе пока не открыт" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { moduleCode?: string; variantId?: string };
  const mod = getModule(String(body.moduleCode ?? ""));
  const variant = mod ? getVariant(mod, String(body.variantId ?? "")) : null;
  if (!mod || !variant || !mod.ready) return NextResponse.json({ error: "Задание не найдено" }, { status: 404 });

  // Если эта попытка уже идёт — не создаём вторую, а возвращаем её
  const running = await prisma.poligonAttempt.findFirst({
    where: { userId: user.id, variantId: variant.id, status: "IN_PROGRESS" },
    select: { id: true },
  });
  if (running) return NextResponse.json({ id: running.id });

  const now = new Date();
  const attempt = await prisma.poligonAttempt.create({
    data: {
      userId: user.id,
      moduleCode: mod.code,
      variantId: variant.id,
      mode: variant.kind === "championship" ? "CHAMPIONSHIP" : "PRACTICE",
      startedAt: now,
      deadlineAt: new Date(now.getTime() + variant.minutes * 60_000),
    },
    select: { id: true },
  });
  return NextResponse.json({ id: attempt.id });
}

export const POST = handleAuth(postHandler);
