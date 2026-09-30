import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { recordPdConsent } from "@/lib/pd-consent";

/** Зафиксировать согласие для уже залогиненного пользователя. */
export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  }
  await recordPdConsent(user.id);
  return NextResponse.json({
    ok: true,
    role: user.role,
    redirect: user.role === "ADMIN" ? "/admin" : "/",
  });
}
