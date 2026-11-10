/*
 * Тренер: сбросить входную диагностику ученика (DELETE) — тогда он сможет пройти её заново.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { handleAuth } from "@/lib/api-auth";

async function deleteHandler(_request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  await requireAdmin();
  const { userId } = await params;
  await prisma.poligonDiag.deleteMany({ where: { userId } });
  return NextResponse.json({ ok: true });
}

export const DELETE = handleAuth(deleteHandler);
