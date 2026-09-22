import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { applyAdminAdjustment } from "@/lib/points";

export async function GET() {
  await requireAdmin();
  const penalties = await prisma.penalty.findMany({
    include: { target: true, admin: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ penalties });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  const body = await request.json();
  const { targetId, amount, reason, type } = body;

  if (!targetId || amount == null || !reason) {
    return NextResponse.json({ error: "Заполните все поля" }, { status: 400 });
  }

  const abs = Math.abs(Number(amount));
  if (!Number.isFinite(abs) || abs < 0.1) {
    return NextResponse.json({ error: "Сумма от 0.1" }, { status: 400 });
  }

  // type: "bonus" | "penalty" (default penalty)
  const signed = type === "bonus" ? abs : -abs;

  try {
    await applyAdminAdjustment(targetId, signed, String(reason).trim(), admin.id);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ошибка" },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}
