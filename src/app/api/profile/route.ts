import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, requireAdmin, createSession } from "@/lib/session";
import { recalculateFinalRating } from "@/lib/rating";
import { extractSteamIdFromInput } from "@/lib/opendota";
import {
  normalizeSecondaryRolesInput,
  serializeSecondaryRoles,
} from "@/lib/secondary-roles";
import type { DotaRole } from "@prisma/client";
import { hashPassword } from "@/lib/password";
import { sealTempPassword } from "@/lib/temp-password";
import { handleAuth } from "@/lib/api-auth";

const ROLES = new Set<string>(["CARRY", "MID", "OFFLANE", "SUPPORT", "HARD_SUPPORT"]);
const MAX_NAME = 50;

/** Настоящий ранг Dota: медаль 1–7 и звёзды 1–5 (11…75) или Титан (80) */
function isValidRankTier(v: number) {
  if (v === 80) return true;
  const medal = Math.floor(v / 10);
  const stars = v % 10;
  return Number.isInteger(v) && medal >= 1 && medal <= 7 && stars >= 1 && stars <= 5;
}

/**
 * Проверка полей профиля. Без неё можно было вписать себе ранг 9999, MMR «abc»
 * или имя длиной в мегабайт — и сломать карточку, баланс команд или страницу.
 * Пустое значение ("" или null) означает «очистить поле» — это можно.
 */
function profileFieldsError(b: Record<string, unknown>): string | null {
  const filled = (v: unknown) => v !== undefined && v !== null && v !== "";
  if (filled(b.mmr)) {
    const mmr = Number(b.mmr);
    if (!Number.isInteger(mmr) || mmr < 0 || mmr > 15000) return "MMR — целое число от 0 до 15 000";
  }
  if (filled(b.rankTier) && !isValidRankTier(Number(b.rankTier))) return "Некорректный ранг";
  for (const key of ["firstName", "lastName"]) {
    if (b[key] !== undefined && b[key] !== null && String(b[key]).trim().length > MAX_NAME) {
      return `Имя и фамилия — не длиннее ${MAX_NAME} символов`;
    }
  }
  for (const key of ["primaryRole", "secondaryRole"]) {
    if (filled(b[key]) && !ROLES.has(String(b[key]))) return "Некорректная роль";
  }
  return null;
}

async function getHandler() {
  const user = await requireUser();
  // Секреты наружу не отдаём: пароль (хеш и временный) и токен привязки Telegram
  const { passwordHash: _ph, loginPasswordTemp: _pt, telegramLinkToken: _lt, ...safe } = user;
  return NextResponse.json({
    user: { ...safe, hasPassword: Boolean(_ph) },
  });
}

async function patchHandler(request: NextRequest) {
  const user = await requireUser();
  const body = await request.json();
  const fieldsError = profileFieldsError(body);
  if (fieldsError) return NextResponse.json({ error: fieldsError }, { status: 400 });
  const profile = user.profile!;

  let firstName = user.firstName;
  let lastName = user.lastName;
  let photoUrl = user.photoUrl;
  let mmr = profile.mmr;
  let rankTier = profile.rankTier;
  let steamAccountId = profile.steamAccountId;
  let primaryRole = profile.primaryRole;
  let secondaryRolesRaw = profile.secondaryRoles;
  let secondaryRole = profile.secondaryRole;

  if (body.firstName !== undefined) {
    const trimmed = String(body.firstName).trim();
    if (!trimmed) {
      return NextResponse.json({ error: "Имя обязательно" }, { status: 400 });
    }
    firstName = trimmed;
  }
  if (body.lastName !== undefined) {
    lastName = body.lastName ? String(body.lastName).trim() : null;
  }
  if (body.photoUrl !== undefined) {
    // Только свои загрузки или https-картинка; javascript:, data: и прочее не принимаем
    const raw = body.photoUrl ? String(body.photoUrl).trim() : "";
    if (raw && !/^\/uploads\/[A-Za-z0-9._-]+$/.test(raw) && !/^https:\/\/[^\s"'<>]+$/i.test(raw)) {
      return NextResponse.json({ error: "Некорректная ссылка на фото" }, { status: 400 });
    }
    photoUrl = raw || null;
  }

  if (body.mmr !== undefined) {
    mmr = body.mmr === null || body.mmr === "" ? null : Number(body.mmr);
  }
  if (body.rankTier !== undefined) {
    rankTier =
      body.rankTier === null || body.rankTier === "" ? null : Number(body.rankTier);
  }
  if (body.steamInput !== undefined) {
    const id = body.steamInput ? extractSteamIdFromInput(body.steamInput) : null;
    steamAccountId = id;
  }
  if (body.primaryRole !== undefined) {
    primaryRole = body.primaryRole ? (body.primaryRole as DotaRole) : null;
  }
  if (body.secondaryRoles !== undefined) {
    const roles = normalizeSecondaryRolesInput(body.secondaryRoles, primaryRole);
    secondaryRolesRaw = serializeSecondaryRoles(roles);
    secondaryRole = roles[0] ?? null;
  } else if (body.secondaryRole !== undefined) {
    secondaryRole = body.secondaryRole ? (body.secondaryRole as DotaRole) : null;
    if (secondaryRole) {
      secondaryRolesRaw = serializeSecondaryRoles([secondaryRole]);
    } else {
      secondaryRolesRaw = "[]";
    }
  }

  const ratings = recalculateFinalRating(
    { rankTier, mmr },
    profile.skillMod ?? 0,
    profile.vibeMod ?? 0
  );

  const [updatedProfile] = await prisma.$transaction([
    prisma.playerProfile.update({
      where: { userId: user.id },
      data: {
        mmr,
        rankTier,
        finalRating: ratings.finalRating,
        skillMod: ratings.skillMod,
        vibeMod: ratings.vibeMod,
        steamAccountId,
        primaryRole,
        secondaryRole,
        secondaryRoles: secondaryRolesRaw,
      },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { firstName, lastName, photoUrl },
    }),
  ]);

  return NextResponse.json({ profile: updatedProfile });
}

async function postHandler(request: NextRequest) {
  const admin = await requireAdmin();
  const body = await request.json();
  const fieldsError = profileFieldsError(body);
  if (fieldsError) return NextResponse.json({ error: fieldsError }, { status: 400 });
  const {
    userId,
    mmr,
    rankTier,
    primaryRole,
    secondaryRole,
    secondaryRoles,
    firstName,
    lastName,
    photoUrl,
    login,
    password,
  } = body;

  const targetUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!targetUser) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

  const profile = await prisma.playerProfile.findUnique({ where: { userId } });
  if (!profile) return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });

  const nextMmr = mmr !== undefined ? (mmr === null || mmr === "" ? null : Number(mmr)) : profile.mmr;
  const nextRankTier =
    rankTier !== undefined
      ? rankTier === null || rankTier === ""
        ? null
        : Number(rankTier)
      : profile.rankTier;

  const nextPrimary =
    primaryRole !== undefined ? (primaryRole as DotaRole | null) : profile.primaryRole;

  let nextSecondaryRoles = profile.secondaryRoles;
  let nextSecondaryRole = profile.secondaryRole;
  if (secondaryRoles !== undefined) {
    const roles = normalizeSecondaryRolesInput(secondaryRoles, nextPrimary);
    nextSecondaryRoles = serializeSecondaryRoles(roles);
    nextSecondaryRole = roles[0] ?? null;
  } else if (secondaryRole !== undefined) {
    nextSecondaryRole = secondaryRole;
    nextSecondaryRoles = secondaryRole
      ? serializeSecondaryRoles([secondaryRole as DotaRole])
      : "[]";
  }

  const ratings = recalculateFinalRating(
    { rankTier: nextRankTier, mmr: nextMmr },
    profile.skillMod ?? 0,
    profile.vibeMod ?? 0
  );

  const userData: {
    firstName?: string;
    lastName?: string | null;
    photoUrl?: string | null;
    login?: string | null;
    passwordHash?: string;
    loginPasswordTemp?: string | null;
    sessionVersion?: { increment: number };
  } = {};
  if (firstName !== undefined) {
    const trimmed = String(firstName).trim();
    if (!trimmed) return NextResponse.json({ error: "Имя обязательно" }, { status: 400 });
    userData.firstName = trimmed;
  }
  if (lastName !== undefined) {
    userData.lastName = lastName ? String(lastName).trim() : null;
  }
  if (photoUrl !== undefined) {
    userData.photoUrl = photoUrl || null;
  }
  if (login !== undefined) {
    const loginTrim = login === null || login === "" ? "" : String(login).trim();
    if (!loginTrim) {
      userData.login = null;
    } else {
      const conflict = await prisma.user.findFirst({
        where: { login: loginTrim, id: { not: userId } },
        select: { id: true },
      });
      if (conflict) {
        return NextResponse.json({ error: "Такой логин уже занят" }, { status: 400 });
      }
      userData.login = loginTrim;
    }
  }
  if (password !== undefined && password !== null && String(password).length > 0) {
    const pwd = String(password);
    if (pwd.length < 6) {
      return NextResponse.json({ error: "Пароль слишком короткий (мин. 6)" }, { status: 400 });
    }
    userData.passwordHash = hashPassword(pwd);
    userData.loginPasswordTemp = sealTempPassword(pwd);   // до рассылки в TG — только зашифрованным
    userData.sessionVersion = { increment: 1 };          // новый пароль — старые входы ученика больше не действуют
  }

  const finalLogin =
    userData.login !== undefined ? userData.login : targetUser.login;
  const finalHasPassword = Boolean(
    userData.passwordHash || targetUser.passwordHash
  );
  if (finalLogin && !finalHasPassword) {
    return NextResponse.json(
      { error: "Для входа задайте пароль вместе с логином" },
      { status: 400 }
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedProfile = await tx.playerProfile.update({
      where: { userId },
      data: {
        mmr: nextMmr,
        rankTier: nextRankTier,
        finalRating: ratings.finalRating,
        skillMod: ratings.skillMod,
        vibeMod: ratings.vibeMod,
        primaryRole: nextPrimary,
        secondaryRole: nextSecondaryRole,
        secondaryRoles: nextSecondaryRoles,
      },
    });

    if (Object.keys(userData).length) {
      await tx.user.update({ where: { id: userId }, data: userData });
    }

    return updatedProfile;
  });

  // Тренер сменил пароль сам себе — выдаём ему новый вход, чтобы не выкинуло с сайта
  if (userData.sessionVersion && userId === admin.id) await createSession(admin.id);

  return NextResponse.json({ profile: updated });
}

// Нет входа / нет прав — ответ 401 / 403, а не «ошибка сервера»
export const GET = handleAuth(getHandler);
export const PATCH = handleAuth(patchHandler);
export const POST = handleAuth(postHandler);
