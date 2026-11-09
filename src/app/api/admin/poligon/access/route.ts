/*
 * Полигон, тренер: открыть или закрыть доступ ученику.
 * POST { userId, access }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { handleAuth } from "@/lib/api-auth";

async function postHandler(request: NextRequest) {
  await requireAdmin();
  const body = (await request.json().catch(() => ({}))) as { userId?: string; access?: boolean };
  if (!body.userId) return NextResponse.json({ error: "Не указан ученик" }, { status: 400 });
  await prisma.user.update({
    where: { id: String(body.userId) },
    data: { poligonAccess: body.access === true },
  });
  return NextResponse.json({ ok: true });
}

export const POST = handleAuth(postHandler);
