import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { handleAuth } from "@/lib/api-auth";
import { canUsePoligon } from "@/lib/poligon/core";
import { parseWorkbook } from "@/lib/poligon/a-practicum";

/** Два раздельных конкурсных дня: ночь между ними не съедает второй таймер. */
export const POST = handleAuth(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  const a = await prisma.poligonAttempt.findUnique({ where: { id } });
  if (!canUsePoligon(user) || !a || a.userId !== user.id) return NextResponse.json({ error: "Попытка не найдена" }, { status: 404 });
  if (a.variantId !== "b-official-two-day" || a.status !== "IN_PROGRESS") return NextResponse.json({ error: "Это не активный двухдневный прогон" }, { status: 409 });
  const w = parseWorkbook(a.workbook);
  const body = await request.json().catch(() => ({}));
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Нужен JSON-объект" }, { status: 400 });
  const day = String(w._b_day || "1");
  let deadlineAt = a.deadlineAt;
  if (body.action === "finishDay1" && day === "1") {
    w._b_day = "break";
    w._b_day1_finished = new Date().toISOString();
    w._b_day1_deadline = a.deadlineAt.toISOString();
  } else if (body.action === "startDay2" && day === "break") {
    w._b_day = "2";
    w._b_day2_started = new Date().toISOString();
    deadlineAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
  } else return NextResponse.json({ error: "Недопустимый переход между днями" }, { status: 409 });
  const changed = await prisma.poligonAttempt.updateMany({ where: { id, status: "IN_PROGRESS", workbook: a.workbook }, data: { workbook: JSON.stringify(w), deadlineAt } });
  if (!changed.count) return NextResponse.json({ error: "Работа изменилась — обнови страницу" }, { status: 409 });
  return NextResponse.json({ ok: true });
});
