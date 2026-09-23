import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { setSessionCookieOnResponse } from "@/lib/session";
import { normalizeBotUsername } from "@/lib/telegram-auth";

/** Создать тикет входа через бота */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({} as { action?: string; token?: string }));

  // Завершить вход: выдать cookie
  if (body.action === "complete" && body.token) {
    return completeTicket(String(body.token));
  }

  const bot = normalizeBotUsername(process.env.NEXT_PUBLIC_BOT_USERNAME);
  if (!bot) {
    return NextResponse.json({ error: "Бот не настроен (NEXT_PUBLIC_BOT_USERNAME)" }, { status: 500 });
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

/** Только статус, без cookie */
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
    if (ticket.status !== "EXPIRED") {
      await prisma.loginTicket.update({
        where: { id: ticket.id },
        data: { status: "EXPIRED" },
      });
    }
    return NextResponse.json({ status: "EXPIRED" });
  }

  if (ticket.status === "USED") {
    return NextResponse.json({ status: "USED" });
  }

  if (ticket.status === "READY" && ticket.userId) {
    const user = await prisma.user.findUnique({
      where: { id: ticket.userId },
      select: { role: true },
    });
    return NextResponse.json({ status: "READY", role: user?.role ?? "STUDENT" });
  }

  return NextResponse.json({ status: "PENDING" });
}

async function completeTicket(token: string) {
  const ticket = await prisma.loginTicket.findUnique({ where: { token } });
  if (!ticket || !ticket.userId) {
    return NextResponse.json({ error: "Тикет не найден", status: "INVALID" }, { status: 400 });
  }
  if (ticket.expiresAt < new Date()) {
    return NextResponse.json({ error: "Истёк", status: "EXPIRED" }, { status: 400 });
  }
  if (ticket.status === "USED") {
    return NextResponse.json({ error: "Уже использован", status: "USED" }, { status: 400 });
  }
  if (ticket.status !== "READY") {
    return NextResponse.json({ error: "Ещё не подтверждён", status: ticket.status }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: ticket.userId },
    select: { role: true },
  });

  const response = NextResponse.json({
    ok: true,
    status: "READY",
    role: user?.role ?? "STUDENT",
  });

  await setSessionCookieOnResponse(response, ticket.userId);
  await prisma.loginTicket.update({
    where: { id: ticket.id },
    data: { status: "USED" },
  });

  return response;
}
