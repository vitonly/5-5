import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, startImpersonation, stopImpersonation } from "@/lib/session";
import { handleAuth } from "@/lib/api-auth";

async function postHandler(request: NextRequest) {
  const admin = await requireAdmin();
  const { studentId } = await request.json();

  const student = await prisma.user.findUnique({ where: { id: studentId } });
  if (!student || student.role !== "STUDENT") {
    return NextResponse.json({ error: "Ученик не найден" }, { status: 404 });
  }

  await startImpersonation(admin.id, student.id);
  return NextResponse.json({ success: true });
}

async function deleteHandler() {
  const adminId = await stopImpersonation();
  if (!adminId) return NextResponse.json({ error: "Нет активного входа под учеником" }, { status: 403 });
  return NextResponse.json({ success: true });
}

// Нет входа / нет прав — ответ 401 / 403, а не «ошибка сервера»
export const POST = handleAuth(postHandler);
export const DELETE = handleAuth(deleteHandler);
