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

/*
 * Режим «войти как ученик».
 * В cookie лежит ПОДПИСАННЫЙ токен {adminId, studentId}: раньше там был голый id админа,
 * и любой мог подставить его и через «Вернуться» получить сессию админа.
 */
type ImpersonationClaims = { adminId: string; studentId: string };

async function signImpersonation(claims: ImpersonationClaims) {
  return new SignJWT({ ...claims, kind: "impersonation" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1d")
    .sign(getSecret());
}

async function readImpersonation(): Promise<ImpersonationClaims | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(IMPERSONATOR_COOKIE)?.value;
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, getSecret());
    if (payload.kind !== "impersonation") return null;
    const adminId = typeof payload.adminId === "string" ? payload.adminId : null;
    const studentId = typeof payload.studentId === "string" ? payload.studentId : null;
    return adminId && studentId ? { adminId, studentId } : null;
  } catch {
    return null;
  }
}

/** id пользователя из основной сессии (без запроса в БД) */
async function sessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return typeof payload.userId === "string" ? payload.userId : null;
  } catch {
    return null;
  }
}

export async function startImpersonation(adminId: string, studentId: string) {
  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATOR_COOKIE, await signImpersonation({ adminId, studentId }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  await createSession(studentId);
}

/**
 * Вернуться в аккаунт тренера. Сработает только если токен подписан нами,
 * текущая сессия — именно тот ученик, а в токене действительно админ.
 */
export async function stopImpersonation() {
  const claims = await readImpersonation();
  const cookieStore = await cookies();
  cookieStore.delete(IMPERSONATOR_COOKIE);
  if (!claims) return null;
  if ((await sessionUserId()) !== claims.studentId) return null;
  const admin = await prisma.user.findUnique({ where: { id: claims.adminId }, select: { role: true } });
  if (admin?.role !== "ADMIN") return null;
  await createSession(claims.adminId);
  return claims.adminId;
}

export async function getImpersonatorId(): Promise<string | null> {
  const claims = await readImpersonation();
  if (!claims) return null;
  return (await sessionUserId()) === claims.studentId ? claims.adminId : null;
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
