import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { PointsLeaderboard } from "@/components/PointsLeaderboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveSeasonId, getSeasonLeaderboard } from "@/lib/points";
import { SEASON_LABELS } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) return null;

  const params = await searchParams;
  const activeSeasonId = await getActiveSeasonId();

  const seasons = await prisma.ratingSeason.findMany({
    orderBy: [{ year: "desc" }, { createdAt: "desc" }],
  });

  const requestedId = params.season;
  const selected =
    (requestedId && seasons.find((s) => s.id === requestedId)) ||
    (activeSeasonId && seasons.find((s) => s.id === activeSeasonId)) ||
    seasons[0] ||
    null;

  const seasonId = selected?.id ?? null;
  const leaderboard = await getSeasonLeaderboard(seasonId);
  const isArchive = selected ? !selected.isActive || selected.status === "CLOSED" : false;
  const closedSeasons = seasons.filter((s) => s.status === "CLOSED" || !s.isActive);

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Статистика</h1>

      {seasons.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {seasons.map((s) => {
            const active = selected?.id === s.id;
            const label = `${SEASON_LABELS[s.name]} ${s.year}`;
            const tag =
              s.isActive && s.status === "OPEN"
                ? "текущий"
                : s.status === "CLOSED"
                  ? "архив"
                  : s.isActive
                    ? "активный"
                    : "архив";
            return (
              <Link
                key={s.id}
                href={`/stats?season=${s.id}`}
                className={`rounded-[var(--radius-control)] border px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "border-[var(--points-border)] bg-[var(--points-bg)] text-[var(--points)]"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:bg-[var(--control)]"
                }`}
              >
                {label}
                <span className="ml-1.5 text-[11px] opacity-70">· {tag}</span>
              </Link>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {selected
              ? `${isArchive ? "Архив" : "Таблица лидеров"} · ${SEASON_LABELS[selected.name]} ${selected.year}`
              : "Таблица лидеров · за всё время"}
          </CardTitle>
          <p className="text-sm text-[var(--text-3)]">
            {selected
              ? isArchive
                ? "Закрытый сезон: очки зафиксированы в истории. Текущий счётчик на платформе обнуляется при закрытии."
                : "Очки текущего активного сезона. Колонка «За всё время» — сумма по всем сезонам (архив)."
              : "Сезонов пока нет — показаны накопленные очки."}
          </p>
        </CardHeader>
        <CardContent>
          <PointsLeaderboard
            entries={leaderboard}
            viewer={user}
            showLifetime
            seasonColumnLabel={isArchive ? "Очки сезона" : "Очки"}
          />
        </CardContent>
      </Card>

      {closedSeasons.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Архив сезонов</CardTitle>
            <p className="text-sm text-[var(--text-3)]">
              При закрытии сезона очки у всех сбрасываются до 0, но таблица этого сезона остаётся
              здесь навсегда.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {closedSeasons.map((s) => (
              <Link
                key={s.id}
                href={`/stats?season=${s.id}`}
                className="flex items-center justify-between rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--control)] px-4 py-3 text-sm transition-colors hover:bg-[var(--border-soft)]"
              >
                <span className="font-medium text-[var(--text)]">
                  {SEASON_LABELS[s.name]} {s.year}
                </span>
                <span className="text-[var(--text-4)]">
                  {s.closedAt
                    ? `закрыт ${new Date(s.closedAt).toLocaleDateString("ru-RU")}`
                    : "закрыт"}{" "}
                  →
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
