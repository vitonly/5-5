import { publicUserSelect } from "@/lib/public-user";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { handleAuth } from "@/lib/api-auth";

async function getHandler() {
  const user = await requireUser();

  const logs = await prisma.pointLog.findMany({
    where: user.role === "ADMIN" ? {} : { userId: user.id },
    include: { user: { select: publicUserSelect } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const leaderboard = await prisma.playerProfile.findMany({
    include: { user: { select: publicUserSelect } },
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

// Нет входа / нет прав — ответ 401 / 403, а не «ошибка сервера»
export const GET = handleAuth(getHandler);
