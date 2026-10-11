import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  const { passwordHash: _ph, loginPasswordTemp: _pt, ...safe } = user;
  return NextResponse.json({
    user: { ...safe, hasPassword: Boolean(_ph) },
  });
}
