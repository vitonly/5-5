import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlayerLink } from "@/components/PlayerLink";
import { OverdueCheckButton } from "@/components/OverdueCheckButton";
import { formatPoints, getActiveSeasonId, getSeasonLeaderboard, restoreSeasonPointsToProfiles } from "@/lib/points";
import { SEASON_LABELS } from "@/lib/labels";

export default async function AdminDashboardPage() {
  const viewer = await getSessionUser();
  const seasonId = await getActiveSeasonId();
  if (seasonId) {
    await restoreSeasonPointsToProfiles(seasonId);
  }
  const [students, overdueCount, openSeason, upcomingMatch, activeSeason, leaderboard] =
    await Promise.all([
      prisma.user.count({ where: { role: "STUDENT" } }),
      prisma.homeworkAssignment.count({ where: { status: "OVERDUE" } }),
      prisma.ratingSeason.findFirst({ where: { status: "OPEN" } }),
      prisma.matchSession.findFirst({
        where: { status: { in: ["PLANNED", "TEAMS_SET", "LINEUPS_CONFIRMED", "IN_PROGRESS"] } },
        orderBy: { date: "asc" },
      }),
      seasonId ? prisma.ratingSeason.findUnique({ where: { id: seasonId } }) : null,
      getSeasonLeaderboard(seasonId),
    ]);

  const topPlayers = leaderboard.slice(0, 5);
  const seasonTitle = activeSeason
    ? `${SEASON_LABELS[activeSeason.name]} ${activeSeason.year}`
    : "текущие очки";

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-[var(--text)]">Админ-панель</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Учеников" value={students} />
        <StatCard title="Просроченных домашек" value={overdueCount} />
        <StatCard title="Открытый сезон" value={openSeason ? "Да" : "Нет"} />
        <StatCard
          title="Ближайший 5v5"
          value={upcomingMatch ? new Date(upcomingMatch.date).toLocaleDateString("ru-RU") : "—"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Топ по очкам · {seasonTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {topPlayers.map((p, i) => (
              <li key={p.userId} className="flex justify-between">
                <span>
                  {i + 1}.{" "}
                  <PlayerLink
                    user={{
                      id: p.userId,
                      firstName: p.firstName,
                      lastName: p.lastName,
                      username: p.username,
                    }}
                    viewer={viewer}
                  />
                </span>
                <span className="text-[var(--points)]">{formatPoints(p.totalPoints)} очк.</span>
              </li>
            ))}
            {topPlayers.length === 0 && (
              <li className="text-[var(--text-3)]">Пока нет начислений</li>
            )}
          </ul>
        </CardContent>
      </Card>

      <OverdueCheckButton />
      <p className="text-sm text-[var(--text-4)]">
        Автопроверка просрочек (−0.5) и автозакрытие сезона по{" "}
        <code className="rounded border border-[var(--border)] bg-[var(--control)] px-1 text-[var(--text-2)]">
          closesAt
        </code>
        : Vercel Cron раз в сутки (05:00 UTC / 08:00 МСК) бьёт в{" "}
        <code className="rounded border border-[var(--border)] bg-[var(--control)] px-1 text-[var(--text-2)]">
          /api/cron/automation
        </code>
        {" "}
        (нужен{" "}
        <code className="rounded border border-[var(--border)] bg-[var(--control)] px-1 text-[var(--text-2)]">
          CRON_SECRET
        </code>
        ). Вручную: кнопка выше или{" "}
        <code className="rounded border border-[var(--border)] bg-[var(--control)] px-1 text-[var(--text-2)]">
          npm run automation
        </code>
        .
      </p>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string | number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-[var(--text-3)]">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold text-[var(--text)]">{value}</p>
      </CardContent>
    </Card>
  );
}
