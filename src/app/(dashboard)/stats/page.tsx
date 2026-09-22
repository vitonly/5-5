import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { PointsLeaderboard } from "@/components/PointsLeaderboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveSeasonId, getSeasonLeaderboard } from "@/lib/points";
import { SEASON_LABELS } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const user = await getSessionUser();
  if (!user) return null;

  const seasonId = await getActiveSeasonId();
  const activeSeason = seasonId
    ? await prisma.ratingSeason.findUnique({ where: { id: seasonId } })
    : null;
  const leaderboard = await getSeasonLeaderboard(seasonId);

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Статистика</h1>

      <Card>
        <CardHeader>
          <CardTitle>
            Таблица лидеров
            {activeSeason
              ? ` · ${SEASON_LABELS[activeSeason.name]} ${activeSeason.year}`
              : " · за всё время"}
          </CardTitle>
          <p className="text-sm text-[var(--text-3)]">
            {activeSeason
              ? "Очки текущего активного сезона. Колонка «Всего» — накопленные за всё время."
              : "Активный сезон не выбран — показаны очки за всё время."}
          </p>
        </CardHeader>
        <CardContent>
          <PointsLeaderboard
            entries={leaderboard}
            viewer={user}
            showLifetime={Boolean(activeSeason)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
