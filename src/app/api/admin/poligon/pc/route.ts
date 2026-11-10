/*
 * Практика на ПК, тренер: начать попытку — внёс неисправность, пошёл таймер.
 * POST { userId, faultId } → { id }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { handleAuth } from "@/lib/api-auth";
import { PC_FAULTS } from "@/content/poligon/pc-faults";

async function postHandler(request: NextRequest) {
  await requireAdmin();
  const body = (await request.json().catch(() => ({}))) as { userId?: string; faultId?: string };
  if (!body.userId || !PC_FAULTS.some((f) => f.id === body.faultId)) {
    return NextResponse.json({ error: "Выбери ученика и неисправность" }, { status: 400 });
  }
  const run = await prisma.poligonPcRun.create({ data: { userId: String(body.userId), faultId: String(body.faultId) } });
  return NextResponse.json({ id: run.id });
}

export const POST = handleAuth(postHandler);
