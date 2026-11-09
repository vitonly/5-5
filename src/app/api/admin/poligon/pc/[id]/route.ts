/*
 * Практика на ПК, тренер: отметки по ходу попытки.
 * PATCH { action: "found" | "fixed" | "hint" | "save" | "finish", utilities?: string[], notes?: string }
 * DELETE — удалить попытку.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { handleAuth } from "@/lib/api-auth";
import { PC_UTILITIES } from "@/content/poligon/pc-faults";

async function patchHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const run = await prisma.poligonPcRun.findUnique({ where: { id } });
  if (!run) return NextResponse.json({ error: "Попытка не найдена" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { action?: string; utilities?: unknown; notes?: unknown };
  const now = new Date();
  const data: { foundAt?: Date; fixedAt?: Date; hints?: number; utilities?: string; notes?: string; done?: boolean } = {};
  if (body.action === "found" && !run.foundAt) data.foundAt = now;
  if (body.action === "fixed" && !run.fixedAt) {
    data.fixedAt = now;
    if (!run.foundAt) data.foundAt = now; // устранил сразу — значит, и нашёл в этот момент
  }
  if (body.action === "hint") data.hints = run.hints + 1;
  if (body.action === "finish") data.done = true;
  if (Array.isArray(body.utilities)) {
    data.utilities = JSON.stringify(body.utilities.filter((u) => typeof u === "string" && PC_UTILITIES.includes(u)));
  }
  if (typeof body.notes === "string") data.notes = body.notes.slice(0, 5000);
  await prisma.poligonPcRun.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

async function deleteHandler(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  await prisma.poligonPcRun.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}

export const PATCH = handleAuth(patchHandler);
export const DELETE = handleAuth(deleteHandler);
