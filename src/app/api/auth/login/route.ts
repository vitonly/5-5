import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { setSessionCookieOnResponse } from "@/lib/session";
import { verifyPassword } from "@/lib/password";
import { recordPdConsent } from "@/lib/pd-consent";

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

  const user = await prisma.user.findUnique({ where: { login: login.trim() } });
  if (!user?.passwordHash || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "Неверный логин или пароль" }, { status: 401 });
  }

  await recordPdConsent(user.id);
  const response = NextResponse.json({ success: true, role: user.role });
  await setSessionCookieOnResponse(response, user.id);
  return response;
}
