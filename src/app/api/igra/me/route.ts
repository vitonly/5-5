import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { displayName } from "@/lib/utils";

/**
 * «Своя игра» (служба на /igra/) спрашивает здесь, кто открыл игру.
 * Служба пересылает cookie браузера, мы отвечаем профилем или 401.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({
    id: user.id,
    name: displayName(user),
    photoUrl: user.photoUrl,
    role: user.role,
  });
}
