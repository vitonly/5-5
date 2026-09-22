import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, startImpersonation, stopImpersonation } from "@/lib/session";

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  const { studentId } = await request.json();

  const student = await prisma.user.findUnique({ where: { id: studentId } });
  if (!student || student.role !== "STUDENT") {
    return NextResponse.json({ error: "Ученик не найден" }, { status: 404 });
  }

  await startImpersonation(admin.id, student.id);
  return NextResponse.json({ success: true });
}

export async function DELETE() {
  await stopImpersonation();
  return NextResponse.json({ success: true });
}
