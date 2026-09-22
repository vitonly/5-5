import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, requireAdmin } from "@/lib/session";
import { toJsonArray } from "@/lib/utils";
import type { MaterialType, DotaRole, SkillLevel } from "@prisma/client";

export async function GET() {
  await requireUser();
  const materials = await prisma.learningMaterial.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ materials });
}

export async function POST(request: NextRequest) {
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

export async function DELETE(request: NextRequest) {
  await requireAdmin();
  const { id } = await request.json();
  await prisma.learningMaterial.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
