import { prisma } from "@/lib/db";
import { AdminMatchesClient } from "@/components/AdminMatchesClient";
import { recalculateAllMatchWinPoints } from "@/lib/points";

export const dynamic = "force-dynamic";

export default async function AdminMatchesPage() {
  // Идемпотентный пересчёт побед 5v5 (база + бонус роли, состав нужной игры)
  await recalculateAllMatchWinPoints().catch(() => 0);

  const [sessions, students] = await Promise.all([
    prisma.matchSession.findMany({
      include: {
        games: true,
        rsvps: {
          include: { user: true },
          orderBy: [{ status: "asc" }, { respondedAt: "asc" }],
        },
        mvpVotes: {
          include: {
            voter: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                username: true,
              },
            },
            nominee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                username: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { date: "desc" },
    }),
    prisma.user.findMany({
      where: { role: "STUDENT" },
      include: { profile: true },
      orderBy: { firstName: "asc" },
    }),
  ]);

  return (
    <div>
      <h1 className="mb-6">5v5 матчи</h1>
      <AdminMatchesClient sessions={sessions} students={students} />
    </div>
  );
}
