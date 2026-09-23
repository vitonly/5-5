import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/session";
import { normalizeBotUsername } from "@/lib/telegram-auth";

/** Создать тикет входа через бота */
export async function POST() {
  const bot = normalizeBotUsername(process.env.NEXT_PUBLIC_BOT_USERNAME);
  if (!bot) {
    return NextResponse.json({ error: "Бот не настроен" }, { status: 500 });
  }

  const token = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.loginTicket.create({
    data: { token, expiresAt, status: "PENDING" },
  });

  return NextResponse.json({
    token,
    botUrl: `https://t.me/${bot}?start=login_${token}`,
    expiresAt: expiresAt.toISOString(),
  });
}

/** Статус тикета; при READY создаёт сессию */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const ticket = await prisma.loginTicket.findUnique({ where: { token } });
  if (!ticket) {
    return NextResponse.json({ status: "INVALID" });
  }

  if (ticket.expiresAt < new Date()) {
    await prisma.loginTicket.update({
      where: { id: ticket.id },
      data: { status: "EXPIRED" },
    });
    return NextResponse.json({ status: "EXPIRED" });
  }

  if (ticket.status === "USED") {
    return NextResponse.json({ status: "USED" });
  }

  if (ticket.status === "READY" && ticket.userId) {
    await createSession(ticket.userId);
    await prisma.loginTicket.update({
      where: { id: ticket.id },
      data: { status: "USED" },
    });
    const user = await prisma.user.findUnique({
      where: { id: ticket.userId },
      select: { role: true },
    });
    return NextResponse.json({ status: "READY", role: user?.role ?? "STUDENT" });
  }

  return NextResponse.json({ status: "PENDING" });
}
