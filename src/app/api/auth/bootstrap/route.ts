import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";

/**
 * Одноразовое создание ученика login=1 / password=1 на пустой прод-БД.
 * POST /api/auth/bootstrap
 * Header: Authorization: Bearer <CRON_SECRET>
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET не задан" }, { status: 503 });
  }

  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token !== secret) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  }

  const passwordHash = hashPassword("1");
  const existing = await prisma.user.findUnique({ where: { login: "1" } });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, role: "STUDENT" },
    });
    return NextResponse.json({ ok: true, updated: true, login: "1", password: "1" });
  }

  await prisma.user.create({
    data: {
      firstName: "Ученик",
      login: "1",
      passwordHash,
      role: "STUDENT",
      profile: { create: {} },
    },
  });

  return NextResponse.json({ ok: true, created: true, login: "1", password: "1" });
}
