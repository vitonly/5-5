import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/session";
import { verifyPassword } from "@/lib/password";

export async function POST(request: NextRequest) {
  const { login, password } = await request.json();

  if (!login || !password) {
    return NextResponse.json({ error: "Введите логин и пароль" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { login: String(login).trim() } });
  if (!user?.passwordHash || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "Неверный логин или пароль" }, { status: 401 });
  }

  await createSession(user.id);
  return NextResponse.json({ success: true, role: user.role });
}
