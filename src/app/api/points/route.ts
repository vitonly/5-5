import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";

export async function GET() {
  const user = await requireUser();

  const logs = await prisma.pointLog.findMany({
    where: user.role === "ADMIN" ? {} : { userId: user.id },
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const leaderboard = await prisma.playerProfile.findMany({
    include: { user: true },
    orderBy: { totalPoints: "desc" },
  });

  return NextResponse.json({
    logs,
    leaderboard: leaderboard.map((p) => ({
      userId: p.userId,
      firstName: p.user.firstName,
      lastName: p.user.lastName,
      username: p.user.username,
      totalPoints: p.totalPoints,
      wins: p.wins,
      losses: p.losses,
      finalRating: p.finalRating,
    })),
  });
}
