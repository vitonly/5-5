import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "./db";
import type { User, PlayerProfile } from "@prisma/client";

const COOKIE_NAME = "dota_session";
const IMPERSONATOR_COOKIE = "dota_impersonator";

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export type SessionUser = User & { profile: PlayerProfile | null };

export async function createSessionToken(userId: string) {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30d")
    .sign(getSecret());
}

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

export async function createSession(userId: string) {
  const token = await createSessionToken(userId);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
}

/** Надёжная установка cookie на конкретный NextResponse (для Route Handlers). */
export async function setSessionCookieOnResponse(
  response: { cookies: { set: (name: string, value: string, options: typeof SESSION_COOKIE_OPTIONS) => void } },
  userId: string
) {
  const token = await createSessionToken(userId);
  response.cookies.set(COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  cookieStore.delete(IMPERSONATOR_COOKIE);
}

export async function startImpersonation(adminId: string, studentId: string) {
  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATOR_COOKIE, adminId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  await createSession(studentId);
}

export async function stopImpersonation() {
  const cookieStore = await cookies();
  const adminId = cookieStore.get(IMPERSONATOR_COOKIE)?.value;
  cookieStore.delete(IMPERSONATOR_COOKIE);
  if (adminId) await createSession(adminId);
  return adminId;
}

export async function getImpersonatorId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(IMPERSONATOR_COOKIE)?.value ?? null;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    const userId = payload.userId as string;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    return user;
  } catch {
    return null;
  }
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
  return user;
}

export function isAdminTelegramId(telegramId: string) {
  const ids = (process.env.ADMIN_TELEGRAM_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.includes(telegramId);
}
