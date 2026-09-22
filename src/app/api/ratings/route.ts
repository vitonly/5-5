import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, requireAdmin } from "@/lib/session";
import { finalizeSeason, refreshPlayerStrength } from "@/lib/seasons";
import type { SeasonName, VibeValue } from "@prisma/client";

function clampScore(n: unknown): number | null {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  const i = Math.round(v);
  if (i < 1 || i > 10) return null;
  return i;
}

const VIBE_VALUES = new Set(["LIKE", "NEUTRAL", "DISLIKE"]);

export async function GET() {
  const user = await requireUser();

  const seasons = await prisma.ratingSeason.findMany({
    include: {
      peerRatings: {
        include: { rater: true, target: true },
      },
      vibeVotes: {
        include: { voter: true, target: true },
      },
    },
    orderBy: [{ year: "desc" }, { name: "desc" }],
  });

  const students = await prisma.user.findMany({
    where: { role: "STUDENT" },
    include: { profile: true },
    orderBy: { firstName: "asc" },
  });

  const openSeason = seasons.find((s) => s.status === "OPEN");
  const activeSeason = seasons.find((s) => s.isActive);

  return NextResponse.json({
    seasons,
    students,
    openSeason,
    activeSeason,
    currentUserId: user.id,
    isAdmin: user.role === "ADMIN",
  });
}

export async function POST(request: NextRequest) {
  await requireAdmin();
  const body = await request.json();
  const { name, year, closesAt } = body as { name: SeasonName; year: number; closesAt?: string };

  const existing = await prisma.ratingSeason.findUnique({
    where: { name_year: { name, year } },
  });
  if (existing) {
    return NextResponse.json({ error: "Такой сезон уже существует" }, { status: 400 });
  }

  await prisma.ratingSeason.updateMany({ data: { isActive: false } });

  const season = await prisma.ratingSeason.create({
    data: {
      name,
      year,
      status: "OPEN",
      isActive: true,
      openedAt: new Date(),
      closesAt: closesAt ? new Date(closesAt) : null,
    },
  });

  return NextResponse.json({ season });
}

export async function PUT(request: NextRequest) {
  const user = await requireUser();
  const body = await request.json();
  const { seasonId, targetId, mechanics, macro, vibe, action, closesAt } = body;

  if (action === "close") {
    await requireAdmin();
    const season = await finalizeSeason(seasonId);
    return NextResponse.json({ season });
  }

  if (action === "open") {
    await requireAdmin();
    const season = await prisma.ratingSeason.update({
      where: { id: seasonId },
      data: { status: "OPEN" },
    });
    return NextResponse.json({ season });
  }

  if (action === "activate") {
    await requireAdmin();
    await prisma.ratingSeason.updateMany({ data: { isActive: false } });
    const season = await prisma.ratingSeason.update({
      where: { id: seasonId },
      data: { isActive: true },
    });
    return NextResponse.json({ season });
  }

  if (action === "setDeadline") {
    await requireAdmin();
    const season = await prisma.ratingSeason.update({
      where: { id: seasonId },
      data: { closesAt: closesAt ? new Date(closesAt) : null },
    });
    return NextResponse.json({ season });
  }

  const season = await prisma.ratingSeason.findUnique({ where: { id: seasonId } });
  if (!season || season.status !== "OPEN") {
    return NextResponse.json({ error: "Голосование закрыто" }, { status: 400 });
  }

  if (user.id === targetId) {
    return NextResponse.json({ error: "Нельзя оценивать себя" }, { status: 400 });
  }

  // Вайб-голос
  if (vibe !== undefined) {
    if (!VIBE_VALUES.has(vibe)) {
      return NextResponse.json({ error: "Некорректный вайб" }, { status: 400 });
    }
    const vote = await prisma.vibeVote.upsert({
      where: {
        seasonId_voterId_targetId: { seasonId, voterId: user.id, targetId },
      },
      update: { value: vibe as VibeValue },
      create: {
        seasonId,
        voterId: user.id,
        targetId,
        value: vibe as VibeValue,
      },
    });
    await refreshPlayerStrength(targetId, seasonId);
    return NextResponse.json({ vibeVote: vote });
  }

  // Скилл: механика + макро
  const mech = clampScore(mechanics);
  const mac = clampScore(macro);
  if (mech === null || mac === null) {
    return NextResponse.json({ error: "Оценки должны быть от 1 до 10" }, { status: 400 });
  }

  const rating = await prisma.peerRating.upsert({
    where: {
      seasonId_raterId_targetId: { seasonId, raterId: user.id, targetId },
    },
    update: { mechanics: mech, macro: mac, teamplay: 5 },
    create: {
      seasonId,
      raterId: user.id,
      targetId,
      mechanics: mech,
      macro: mac,
      teamplay: 5,
    },
  });

  await refreshPlayerStrength(targetId, seasonId);
  return NextResponse.json({ rating });
}
