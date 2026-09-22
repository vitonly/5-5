import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/session";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Недоступно в продакшене" }, { status: 403 });
  }

  const adminId = (process.env.ADMIN_TELEGRAM_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)[0];

  const telegramId = adminId || "dev-admin";

  const user = await prisma.user.upsert({
    where: { telegramId },
    update: { role: "ADMIN" },
    create: {
      telegramId,
      firstName: "Тренер",
      lastName: "(разработка)",
      role: "ADMIN",
      profile: {
        create: {},
      },
    },
    include: { profile: true },
  });

  if (!user.profile) {
    await prisma.playerProfile.create({
      data: { userId: user.id },
    });
  }

  await createSession(user.id);
  return NextResponse.json({ success: true });
}
