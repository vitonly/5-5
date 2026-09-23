import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, requireAdmin } from "@/lib/session";
import { recalculateFinalRating } from "@/lib/rating";
import { extractSteamIdFromInput } from "@/lib/opendota";
import {
  normalizeSecondaryRolesInput,
  serializeSecondaryRoles,
} from "@/lib/secondary-roles";
import type { DotaRole } from "@prisma/client";

export async function GET() {
  const user = await requireUser();
  return NextResponse.json({ user });
}

export async function PATCH(request: NextRequest) {
  const user = await requireUser();
  const body = await request.json();
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
    photoUrl = body.photoUrl || null;
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

export async function POST(request: NextRequest) {
  await requireAdmin();
  const body = await request.json();
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

  const userData: { firstName?: string; lastName?: string | null; photoUrl?: string | null } = {};
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

  return NextResponse.json({ profile: updated });
}
