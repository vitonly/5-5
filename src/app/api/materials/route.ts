import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, requireAdmin } from "@/lib/session";
import { toJsonArray } from "@/lib/utils";
import type { MaterialType, DotaRole, SkillLevel } from "@prisma/client";
import { handleAuth } from "@/lib/api-auth";

async function getHandler() {
  await requireUser();
  const materials = await prisma.learningMaterial.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ materials });
}

async function postHandler(request: NextRequest) {
  await requireAdmin();
  const { type, title, description, url, positions, skillLevels } = await request.json();

  const trimmedTitle = title ? String(title).trim() : "";
  const trimmedDescription = description ? String(description).trim() : "";
  const trimmedUrl = url ? String(url).trim() : null;

  if (!trimmedTitle && !trimmedDescription && !trimmedUrl) {
    return NextResponse.json(
      { error: "Укажите ссылку, название или описание" },
      { status: 400 }
    );
  }

  const material = await prisma.learningMaterial.create({
    data: {
      type: (type as MaterialType) || "VIDEO",
      title: trimmedTitle,
      description: trimmedDescription,
      url: trimmedUrl,
      positions: toJsonArray((positions as DotaRole[]) || []),
      skillLevels: toJsonArray((skillLevels as SkillLevel[]) || []),
    },
  });

  return NextResponse.json({ material });
}

async function patchHandler(request: NextRequest) {
  await requireAdmin();
  const { id, type, title, description, url, positions, skillLevels } =
    await request.json();

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Не указан материал" }, { status: 400 });
  }

  const trimmedTitle = title ? String(title).trim() : "";
  const trimmedDescription = description ? String(description).trim() : "";
  const trimmedUrl = url ? String(url).trim() : null;

  if (!trimmedTitle && !trimmedDescription && !trimmedUrl) {
    return NextResponse.json(
      { error: "Укажите ссылку, название или описание" },
      { status: 400 }
    );
  }

  const materialType = (type as MaterialType) || "VIDEO";
  const material = await prisma.learningMaterial.update({
    where: { id },
    data: {
      type: materialType,
      title: trimmedTitle,
      description: trimmedDescription,
      url: trimmedUrl,
      positions: toJsonArray((positions as DotaRole[]) || []),
      skillLevels: toJsonArray(
        materialType === "VIDEO" ? (skillLevels as SkillLevel[]) || [] : []
      ),
    },
  });

  return NextResponse.json({ material });
}

async function deleteHandler(request: NextRequest) {
  await requireAdmin();
  const { id } = await request.json();
  await prisma.learningMaterial.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

// Нет входа / нет прав — ответ 401 / 403, а не «ошибка сервера»
export const GET = handleAuth(getHandler);
export const POST = handleAuth(postHandler);
export const PATCH = handleAuth(patchHandler);
export const DELETE = handleAuth(deleteHandler);
