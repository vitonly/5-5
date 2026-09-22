import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlayerLink } from "@/components/PlayerLink";
import { MatchNav } from "@/components/MatchNav";
import { PointsPill } from "@/components/StatPills";
import { SEASON_LABELS } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function MatchSeasonsPage() {
  const user = await getSessionUser();
  if (!user) return null;

  const seasons = await prisma.ratingSeason.findMany({
    orderBy: [{ year: "desc" }, { name: "desc" }],
  });

  const users = await prisma.user.findMany({
    where: { role: "STUDENT" },
    select: { id: true, firstName: true, lastName: true, username: true },
  });
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  // Очки по каждому сезону
  const standings = await Promise.all(
    seasons.map(async (season) => {
      const grouped = await prisma.pointLog.groupBy({
        by: ["userId"],
        where: { seasonId: season.id },
        _sum: { delta: true },
      });
      const rows = grouped
        .map((g) => ({
          userId: g.userId,
          points: g._sum.delta ?? 0,
          user: userMap[g.userId],
        }))
        .filter((r) => r.user)
        .sort((a, b) => b.points - a.points);
      return { season, rows };
    })
  );

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Субботние 5v5</h1>
      <MatchNav />

      {standings.length === 0 ? (
        <p className="text-[var(--text-3)]">Сезоны ещё не созданы.</p>
      ) : (
        <div className="space-y-6">
          {standings.map(({ season, rows }) => (
            <Card key={season.id}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle>
                    {SEASON_LABELS[season.name]} {season.year}
                  </CardTitle>
                  {season.isActive ? (
                    <Badge variant="success">Идёт</Badge>
                  ) : (
                    <Badge>Закрыт</Badge>
                  )}
                  {season.status === "OPEN" && <Badge variant="warning">Голосование открыто</Badge>}
                </div>
              </CardHeader>
              <CardContent>
                {rows.length === 0 ? (
                  <p className="text-sm text-[var(--text-3)]">Очков пока нет</p>
                ) : (
                  <ol className="space-y-1">
                    {rows.map((r, i) => (
                      <li
                        key={r.userId}
                        className="flex items-center justify-between rounded-[var(--radius-control)] bg-[var(--control)] px-3 py-2 text-sm"
                      >
                        <span>
                          <span className="mr-2 text-[var(--text-4)]">{i + 1}.</span>
                          <PlayerLink user={{ id: r.userId, ...r.user! }} viewer={user} />
                        </span>
                        <PointsPill value={r.points} />
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
