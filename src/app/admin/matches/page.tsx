import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { AdminMatchesClient } from "@/components/AdminMatchesClient";
import type { ReplayData } from "@/lib/replay";
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
        replays: {
          select: {
            gameNumber: true,
            durationSec: true,
            radiantScore: true,
            direScore: true,
            data: true,
          },
        },
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
        predictions: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                username: true,
              },
            },
          },
          orderBy: [{ gameNumber: "asc" }, { updatedAt: "asc" }],
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
      <AdminMatchesClient
        sessions={sessions.map(({ replays, ...rest }) => ({
          ...rest,
          replays: replays.map((r) => {
            const players = ((r.data as unknown as ReplayData)?.players ?? []) as ReplayData["players"];
            return {
              gameNumber: r.gameNumber,
              durationSec: r.durationSec,
              radiantScore: r.radiantScore,
              direScore: r.direScore,
              matched: players.filter((p) => p.userId).length,
              total: players.length,
              unmatched: players.filter((p) => !p.userId).map((p) => p.name ?? "без ника"),
            };
          }),
        }))}
        students={students}
      />
    </div>
  );
}
