import { prisma } from "@/lib/db";
import { PLAYER_ROLES } from "@/lib/coach";
import { requireAdmin } from "@/lib/session";
import { PageHeader } from "@/components/ui/page-header";
import { AdminMatchesClient } from "@/components/AdminMatchesClient";
import type { ReplayData } from "@/lib/replay";
import { AdminSeriesCard } from "@/components/match/AdminSeriesCard";
import { getActiveSeries, getSeriesLeaderboard, seriesParticipantIds } from "@/lib/match-series";

export const metadata = { title: "Матчи · Админка" };

export const dynamic = "force-dynamic";

export default async function AdminMatchesPage() {
  const coach = await requireAdmin();   // кто открыл страницу — для кнопки «Я тоже играю»
  // Пересчёт очков за все победы раньше шёл тут при каждом открытии страницы
  // (по запросу к базе на каждую победу) — теперь раз в час в автоматизации (lib/automation.ts)

  const [sessions, students, series] = await Promise.all([
    prisma.matchSession.findMany({
      include: {
        games: true,
        series: { select: { name: true } },   // игра мини-сезона — подпишем её в карточке
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
      where: { role: { in: PLAYER_ROLES } },   // тренер тоже может играть
      include: { profile: true },
      orderBy: { firstName: "asc" },
    }),
    getActiveSeries(),   // мини-сезон («Игры по сертификатам»), если идёт
  ]);
  const activeSeries = series
    ? { id: series.id, name: series.name, participantIds: seriesParticipantIds(series) }
    : null;
  const seriesTable = series ? await getSeriesLeaderboard(series) : [];

  return (
    <div>
      <PageHeader eyebrow="Панель тренера" title="Субботние 5v5" description="Запись, составы, результаты игр и MVP." />
      <div className="mb-8">
        <AdminSeriesCard
          series={activeSeries}
          table={seriesTable}
          allStudentIds={students.filter((s) => s.role === "STUDENT").map((s) => s.id)}
        />
      </div>
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
        coachId={coach.id}
        activeSeries={activeSeries}
      />
    </div>
  );
}
