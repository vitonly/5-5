import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { recalculateFinalRating } from "@/lib/rating";
import { generateTelegramLinkToken } from "@/lib/telegram-links";
import { handleAuth } from "@/lib/api-auth";
import { sealTempPassword } from "@/lib/temp-password";

async function getHandler() {
  await requireAdmin();
  const students = await prisma.user.findMany({
    where: { role: "STUDENT" },
    include: { profile: true },
    orderBy: { firstName: "asc" },
  });
  return NextResponse.json({ students });
}

async function postHandler(request: NextRequest) {
  await requireAdmin();
  const body = await request.json();
  const { firstName, lastName, login, password, mmr } = body;

  if (!firstName || !String(firstName).trim()) {
    return NextResponse.json({ error: "Имя обязательно" }, { status: 400 });
  }

  const loginTrim = login ? String(login).trim() : "";
  const passwordStr = password ? String(password) : "";
  if (!loginTrim || !passwordStr) {
    return NextResponse.json({ error: "Имя, логин и пароль обязательны" }, { status: 400 });
  }
  if (passwordStr.length < 6) {
    return NextResponse.json({ error: "Пароль слишком короткий (мин. 6)" }, { status: 400 });
  }
  const existing = await prisma.user.findUnique({ where: { login: loginTrim } });
  if (existing) {
    return NextResponse.json({ error: "Такой логин уже занят" }, { status: 400 });
  }

  const mmrValue = mmr ? Number(mmr) : null;
  const ratings = recalculateFinalRating({ mmr: mmrValue, rankTier: null }, 0, 0);

  const student = await prisma.user.create({
    data: {
      firstName: String(firstName).trim(),
      lastName: lastName ? String(lastName).trim() : null,
      login: loginTrim,
      passwordHash: hashPassword(passwordStr),
      loginPasswordTemp: sealTempPassword(passwordStr),   // до рассылки в TG — только зашифрованным
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

async function deleteHandler(request: NextRequest) {
  await requireAdmin();
  const { studentId } = await request.json();
  await prisma.user.delete({ where: { id: studentId } });
  return NextResponse.json({ success: true });
}

// Нет входа / нет прав — ответ 401 / 403, а не «ошибка сервера»
export const GET = handleAuth(getHandler);
export const POST = handleAuth(postHandler);
export const DELETE = handleAuth(deleteHandler);
