/* Учебный набор выдаём по серверному seed конкретной попытки. */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { handleAuth } from "@/lib/api-auth";
import { canUsePoligon } from "@/lib/poligon/core";
import { parseWorkbook } from "@/lib/poligon/a-practicum";
import { isBPractice } from "@/lib/poligon/b-practice";
import { buildBDatasetXlsx } from "@/lib/poligon/b-office";

export const runtime = "nodejs";

async function getHandler(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!canUsePoligon(user)) return NextResponse.json({ error: "Раздел «Профессионалы» тебе пока не открыт" }, { status: 403 });
  const { id } = await params;
  const attempt = await prisma.poligonAttempt.findUnique({ where: { id } });
  if (!attempt || (attempt.userId !== user.id && user.role !== "ADMIN")) {
    return NextResponse.json({ error: "Попытка не найдена" }, { status: 404 });
  }
  if (!isBPractice(attempt.variantId)) return NextResponse.json({ error: "Это не учебная практика модуля Б" }, { status: 400 });
  const seed = parseWorkbook(attempt.workbook)._b_seed;
  if (typeof seed !== "string" || !/^[a-f0-9]{16}$/.test(seed)) {
    return NextResponse.json({ error: "Нет исходных данных попытки — начни новую практику" }, { status: 400 });
  }
  const bytes = await buildBDatasetXlsx(seed);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="dataset.xlsx"; filename*=UTF-8''${encodeURIComponent("учебный.xlsx")}`,
      "Cache-Control": "no-store",
    },
  });
}

export const GET = handleAuth(getHandler);
