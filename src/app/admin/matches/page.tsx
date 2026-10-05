import { prisma } from "@/lib/db";
import { AdminMatchesClient } from "@/components/AdminMatchesClient";
import { recalculateStreakWinPoints } from "@/lib/points";

export const dynamic = "force-dynamic";

export default async function AdminMatchesPage() {
  await recalculateStreakWinPoints().catch(() => 0);

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
      <h1 className="mb-6 text-3xl font-bold">5v5 матчи</h1>
      <AdminMatchesClient sessions={sessions} students={students} />
    </div>
  );
}
