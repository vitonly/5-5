import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { AdminMatchesClient } from "@/components/AdminMatchesClient";
import { recalculateAllMatchWinPoints } from "@/lib/points";

export const metadata = { title: "Матчи · Админка" };

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
      <PageHeader eyebrow="Панель тренера" title="Субботние 5v5" description="Запись, составы, результаты игр и MVP." />
      <AdminMatchesClient sessions={sessions} students={students} />
    </div>
  );
}
