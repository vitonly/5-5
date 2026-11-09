/*
 * Полигон, тренер: исходные файлы вариантов (датасет чемпионата, бланки).
 * POST { variantId, label, url } — прикрепить файл (сначала загрузить через /api/upload)
 * DELETE { id } — открепить
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { handleAuth } from "@/lib/api-auth";
import { POLIGON_MODULES } from "@/content/poligon";

const VARIANT_IDS = new Set(POLIGON_MODULES.flatMap((m) => m.variants.map((v) => v.id)));

async function postHandler(request: NextRequest) {
  await requireAdmin();
  const body = (await request.json().catch(() => ({}))) as { variantId?: string; label?: string; url?: string };
  const variantId = String(body.variantId ?? "");
  const url = String(body.url ?? "");
  if (!VARIANT_IDS.has(variantId)) return NextResponse.json({ error: "Нет такого варианта" }, { status: 400 });
  if (!url.startsWith("/uploads/")) return NextResponse.json({ error: "Файл должен быть загружен на сайт" }, { status: 400 });
  const file = await prisma.poligonVariantFile.create({
    data: { variantId, url, label: String(body.label ?? "Файл").slice(0, 200) || "Файл" },
  });
  return NextResponse.json({ id: file.id });
}

async function deleteHandler(request: NextRequest) {
  await requireAdmin();
  const body = (await request.json().catch(() => ({}))) as { id?: string };
  await prisma.poligonVariantFile.deleteMany({ where: { id: String(body.id ?? "") } });
  return NextResponse.json({ ok: true });
}

export const POST = handleAuth(postHandler);
export const DELETE = handleAuth(deleteHandler);
