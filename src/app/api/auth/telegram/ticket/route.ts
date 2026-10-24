import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { setSessionCookieOnResponse } from "@/lib/session";
import { normalizeBotUsername } from "@/lib/telegram-auth";
import { recordPdConsent } from "@/lib/pd-consent";
import { clientIp, hit, retryAfterSec } from "@/lib/rate-limit";

/** Не больше 20 новых тикетов входа с одного адреса за 10 минут — иначе базу можно засыпать мусором */
const TICKETS_PER_IP = 20;
const TICKET_WINDOW_MS = 10 * 60 * 1000;

/** Создать тикет входа через бота / завершить вход */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(
    () => ({} as { action?: string; token?: string; pdConsent?: boolean })
  );

  if (body.action === "complete" && body.token) {
    return completeTicket(String(body.token));
  }

  if (!body.pdConsent) {
    return NextResponse.json(
      { error: "Нужно согласие на обработку персональных данных" },
      { status: 400 }
    );
  }

  const bot = normalizeBotUsername(process.env.NEXT_PUBLIC_BOT_USERNAME);
  if (!bot) {
    return NextResponse.json({ error: "Бот не настроен (NEXT_PUBLIC_BOT_USERNAME)" }, { status: 500 });
  }

  const ipKey = `ticket:${clientIp(request.headers)}`;
  const wait = retryAfterSec(ipKey, TICKETS_PER_IP);
  if (wait > 0) {
    return NextResponse.json(
      { error: `Слишком много попыток входа. Попробуйте через ${Math.ceil(wait / 60)} мин.` },
      { status: 429, headers: { "Retry-After": String(wait) } }
    );
  }
  hit(ipKey, TICKET_WINDOW_MS);

  const token = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.loginTicket.create({
    data: { token, expiresAt, status: "PENDING", pdConsent: true },
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
  try {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 8) {
      return NextResponse.json(
        {
          error:
            "JWT_SECRET не задан или слишком короткий в Vercel Environment Variables. Задай любую длинную строку и сделай Redeploy.",
        },
        { status: 500 }
      );
    }

    const ticket = await prisma.loginTicket.findUnique({ where: { token } });
    if (!ticket || !ticket.userId) {
      return NextResponse.json(
        { error: "Тикет не найден. Нажмите «Войти через бота» ещё раз.", status: "INVALID" },
        { status: 400 }
      );
    }

    // Тикет одноразовый: повторно (и после истечения) сессию не выдаём
    if (ticket.status === "USED") {
      return NextResponse.json(
        { error: "Этот вход уже использован. Нажмите «Войти через Telegram» ещё раз.", status: "USED" },
        { status: 400 }
      );
    }

    if (ticket.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Ссылка истекла. Нажмите «Войти через бота» ещё раз.", status: "EXPIRED" },
        { status: 400 }
      );
    }

    if (ticket.status !== "READY") {
      return NextResponse.json(
        { error: "Ещё не подтверждено в Telegram. Нажмите Start в боте.", status: ticket.status },
        { status: 400 }
      );
    }

    if (ticket.pdConsent) {
      await recordPdConsent(ticket.userId);
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

    // Помечаем использованным атомарно: два параллельных запроса не получат две сессии
    const claimed = await prisma.loginTicket.updateMany({
      where: { id: ticket.id, status: "READY" },
      data: { status: "USED" },
    });
    if (claimed.count !== 1) {
      return NextResponse.json(
        { error: "Этот вход уже использован. Нажмите «Войти через Telegram» ещё раз.", status: "USED" },
        { status: 400 }
      );
    }

    await setSessionCookieOnResponse(response, ticket.userId);

    return response;
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? `Ошибка сессии: ${e.message}`
            : "Не удалось создать сессию",
      },
      { status: 500 }
    );
  }
}
