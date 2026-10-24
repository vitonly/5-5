import { NextResponse } from "next/server";
import { destroySession, getImpersonatorId, getSessionUser, revokeAllSessions } from "@/lib/session";

export async function POST() {
  const user = await getSessionUser();
  // «Выйти» закрывает вход на всех устройствах: скопированная cookie тоже перестаёт работать.
  // Если тренер зашёл «как ученик», входы самого ученика не трогаем.
  if (user && !(await getImpersonatorId())) {
    await revokeAllSessions(user.id);
  }
  await destroySession();
  return NextResponse.json({ success: true });
}
