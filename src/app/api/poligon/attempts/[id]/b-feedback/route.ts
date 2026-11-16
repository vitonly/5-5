import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { handleAuth } from "@/lib/api-auth";
import { canUsePoligon } from "@/lib/poligon/core";
import { parseWorkbook } from "@/lib/poligon/a-practicum";
import { isBPractice } from "@/lib/poligon/b-practice";

/** Отделяем самостоятельный ответ от исправления после просмотра решения. */
export const POST = handleAuth(async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  const a = await prisma.poligonAttempt.findUnique({ where: { id } });
  if (!canUsePoligon(user) || !a || a.userId !== user.id) return NextResponse.json({ error: "Попытка не найдена" }, { status: 404 });
  if (!isBPractice(a.variantId) || a.status !== "IN_PROGRESS") return NextResponse.json({ error: "Попытка уже закрыта" }, { status: 409 });
  const w = parseWorkbook(a.workbook);
  if (!w._b_revealed) {
    w._b_revealed = new Date().toISOString();
    const changed = await prisma.poligonAttempt.updateMany({ where: { id, workbook: a.workbook, status: "IN_PROGRESS" }, data: { workbook: JSON.stringify(w) } });
    if (!changed.count) return NextResponse.json({ error: "Сначала сохрани ответы и повтори" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
});
