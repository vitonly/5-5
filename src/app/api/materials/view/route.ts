import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { handleAuth } from "@/lib/api-auth";

/** Отметить материал как просмотренный */
async function postHandler(request: NextRequest) {
  const user = await requireUser();
  const { materialId } = await request.json();
  if (!materialId || typeof materialId !== "string") {
    return NextResponse.json({ error: "Не указан материал" }, { status: 400 });
  }

  const material = await prisma.learningMaterial.findUnique({ where: { id: materialId } });
  if (!material) {
    return NextResponse.json({ error: "Материал не найден" }, { status: 404 });
  }

  const view = await prisma.materialView.upsert({
    where: { userId_materialId: { userId: user.id, materialId } },
    create: { userId: user.id, materialId, viewedAt: new Date() },
    update: { viewedAt: new Date() },
  });

  return NextResponse.json({ view });
}

/** Снять отметку «просмотрено» */
async function deleteHandler(request: NextRequest) {
  const user = await requireUser();
  const { materialId } = await request.json();
  if (!materialId || typeof materialId !== "string") {
    return NextResponse.json({ error: "Не указан материал" }, { status: 400 });
  }

  await prisma.materialView.deleteMany({
    where: { userId: user.id, materialId },
  });

  return NextResponse.json({ success: true });
}

// Нет входа / нет прав — ответ 401 / 403, а не «ошибка сервера»
export const POST = handleAuth(postHandler);
export const DELETE = handleAuth(deleteHandler);
