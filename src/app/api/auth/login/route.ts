import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { setSessionCookieOnResponse } from "@/lib/session";
import { verifyPassword } from "@/lib/password";
import { recordPdConsent } from "@/lib/pd-consent";
import { clientIp, hit, reset, retryAfterSec } from "@/lib/rate-limit";

/** Не больше 10 неудачных попыток на логин и 30 с одного IP за 15 минут */
const WINDOW_MS = 15 * 60 * 1000;
const PER_LOGIN = 10;
const PER_IP = 30;

const MAX_LEN = 200;

export async function POST(request: NextRequest) {
  // Битый JSON / не объект — контролируемый 400 вместо 500
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const { login, password, pdConsent } = body as Record<string, unknown>;

  if (typeof login !== "string" || typeof password !== "string" || !login.trim() || !password) {
    return NextResponse.json({ error: "Введите логин и пароль" }, { status: 400 });
  }
  if (login.length > MAX_LEN || password.length > MAX_LEN) {
    return NextResponse.json({ error: "Слишком длинный логин или пароль" }, { status: 400 });
  }
  // Строго true: строка "false" и прочее согласием не считаются
  if (pdConsent !== true) {
    return NextResponse.json(
      { error: "Нужно согласие на обработку персональных данных" },
      { status: 400 }
    );
  }

  const ip = clientIp(request.headers);
  const loginKey = `login:${login.trim().toLowerCase()}`;
  const ipKey = `ip:${ip}`;
  const wait = Math.max(retryAfterSec(loginKey, PER_LOGIN), retryAfterSec(ipKey, PER_IP));
  if (wait > 0) {
    return NextResponse.json(
      { error: `Слишком много попыток входа. Попробуйте через ${Math.ceil(wait / 60)} мин.` },
      { status: 429, headers: { "Retry-After": String(wait) } }
    );
  }

  const user = await prisma.user.findUnique({ where: { login: login.trim() } });
  if (!user?.passwordHash || !verifyPassword(password, user.passwordHash)) {
    hit(loginKey, WINDOW_MS);
    hit(ipKey, WINDOW_MS);
    return NextResponse.json({ error: "Неверный логин или пароль" }, { status: 401 });
  }
  reset(loginKey);

  await recordPdConsent(user.id);
  const response = NextResponse.json({ success: true, role: user.role });
  await setSessionCookieOnResponse(response, user.id);
  return response;
}
