import { NextResponse } from "next/server";
import { getImpersonatorId, getSessionUser } from "@/lib/session";
import { markAchievementsSeen } from "@/lib/achievements";

/** Ученик закрыл окно «Новая ачивка» */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  // Тренер, зашедший «за ученика», не должен «съедать» праздник
  if (await getImpersonatorId()) return NextResponse.json({ ok: true, skipped: true });
  await markAchievementsSeen(user.id);
  return NextResponse.json({ ok: true });
}
