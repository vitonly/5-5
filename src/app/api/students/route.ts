import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { recalculateFinalRating } from "@/lib/rating";
import { generateTelegramLinkToken } from "@/lib/telegram-links";

export async function GET() {
  await requireAdmin();
  const students = await prisma.user.findMany({
    where: { role: "STUDENT" },
    include: { profile: true },
    orderBy: { firstName: "asc" },
  });
  return NextResponse.json({ students });
}

export async function POST(request: NextRequest) {
  await requireAdmin();
  const body = await request.json();
  const { firstName, lastName, login, password, mmr } = body;

  if (!firstName || !login || !password) {
    return NextResponse.json({ error: "Имя, логин и пароль обязательны" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { login: String(login).trim() } });
  if (existing) {
    return NextResponse.json({ error: "Такой логин уже занят" }, { status: 400 });
  }

  const mmrValue = mmr ? Number(mmr) : null;
  const ratings = recalculateFinalRating({ mmr: mmrValue, rankTier: null }, 0, 0);

  const student = await prisma.user.create({
    data: {
      firstName: String(firstName).trim(),
      lastName: lastName ? String(lastName).trim() : null,
      login: String(login).trim(),
      passwordHash: hashPassword(String(password)),
      telegramLinkToken: generateTelegramLinkToken(),
      role: "STUDENT",
      profile: {
        create: {
          mmr: mmrValue,
          finalRating: ratings.finalRating,
          skillMod: 0,
          vibeMod: 0,
        },
      },
    },
    include: { profile: true },
  });

  return NextResponse.json({ student });
}

export async function DELETE(request: NextRequest) {
  await requireAdmin();
  const { studentId } = await request.json();
  await prisma.user.delete({ where: { id: studentId } });
  return NextResponse.json({ success: true });
}
