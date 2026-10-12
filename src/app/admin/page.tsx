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
      <h1 className="text-[var(--text)]">Админ-панель</h1>

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
          <ul className="divide-y divide-[var(--border-soft)] text-sm">
            {topPlayers.map((p, i) => (
              <li key={p.userId} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="w-5 shrink-0 font-mono-num font-bold text-[var(--text-3)]">{i + 1}</span>
                  <PlayerLink
                    user={{
                      id: p.userId,
                      firstName: p.firstName,
                      lastName: p.lastName,
                      username: p.username,
                      photoUrl: p.photoUrl,
                    }}
                    viewer={viewer}
                    avatar={26}
                  />
                </span>
                <span className="shrink-0 font-mono-num font-semibold text-[var(--points)]">{formatPoints(p.totalPoints)} очк.</span>
              </li>
            ))}
            {topPlayers.length === 0 && (
              <li className="text-[var(--text-3)]">Пока нет начислений</li>
            )}
          </ul>
        </CardContent>
      </Card>

      <OverdueCheckButton />
      <p className="text-sm text-[var(--text-3)]">
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
    <Card className="p-4 sm:p-5">
      <p className="text-[13px] font-medium leading-5 text-[var(--text-3)]">{title}</p>
      <p className="mt-2 font-mono-num text-[28px] font-bold leading-8 text-[var(--text)]">{value}</p>
    </Card>
  );
}
