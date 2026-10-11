import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { recalculateFinalRating } from "@/lib/rating";
import { generateTelegramLinkToken } from "@/lib/telegram-links";
import { resolveVkInput } from "@/lib/vk-auth";

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
  const { firstName, lastName, login, password, mmr, vkInput } = body;

  if (!firstName || !String(firstName).trim()) {
    return NextResponse.json({ error: "Имя обязательно" }, { status: 400 });
  }

  const loginTrim = login ? String(login).trim() : "";
  const passwordStr = password ? String(password) : "";
  if (!loginTrim || !passwordStr) {
    return NextResponse.json({ error: "Имя, логин и пароль обязательны" }, { status: 400 });
  }
  if (passwordStr.length < 4) {
    return NextResponse.json({ error: "Пароль слишком короткий (мин. 4)" }, { status: 400 });
  }
  const existing = await prisma.user.findUnique({ where: { login: loginTrim } });
  if (existing) {
    return NextResponse.json({ error: "Такой логин уже занят" }, { status: 400 });
  }

  let vkId: string | null = null;
  let vkScreenName: string | null = null;
  if (vkInput !== undefined && vkInput !== null && String(vkInput).trim()) {
    try {
      const resolved = await resolveVkInput(String(vkInput));
      const conflict = await prisma.user.findFirst({
        where: { vkId: resolved.vkId },
        select: { id: true, firstName: true },
      });
      if (conflict) {
        return NextResponse.json(
          { error: `Этот VK уже привязан к «${conflict.firstName}»` },
          { status: 400 }
        );
      }
      vkId = resolved.vkId;
      vkScreenName = resolved.screenName;
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Некорректный VK профиль" },
        { status: 400 }
      );
    }
  }

  const mmrValue = mmr ? Number(mmr) : null;
  const ratings = recalculateFinalRating({ mmr: mmrValue, rankTier: null }, 0, 0);

  const student = await prisma.user.create({
    data: {
      firstName: String(firstName).trim(),
      lastName: lastName ? String(lastName).trim() : null,
      login: loginTrim,
      passwordHash: hashPassword(passwordStr),
      loginPasswordTemp: passwordStr,
      vkId,
      vkScreenName,
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
