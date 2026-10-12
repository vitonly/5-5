import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { PointsLeaderboard } from "@/components/PointsLeaderboard";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader, StatTile } from "@/components/ui/page-header";
import { formatShortDate } from "@/lib/format";
import { formatPoints, getActiveSeasonId, getSeasonLeaderboard } from "@/lib/points";
import { SEASON_LABELS } from "@/lib/labels";

export const metadata = { title: "Статистика" };

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

  const myIndex = leaderboard.findIndex((e) => e.userId === user.id);
  const me = myIndex >= 0 ? leaderboard[myIndex] : null;
  const above = myIndex > 0 ? leaderboard[myIndex - 1] : null;
  const seasonLabel = selected ? `${SEASON_LABELS[selected.name]} ${selected.year}` : "За всё время";

  return (
    <div>
      <PageHeader
        eyebrow="Рейтинг"
        title="Статистика"
        description="Таблица очков по сезонам. Топ-3 в конце сезона получают призы."
      />

      {seasons.length > 1 && (
        <nav aria-label="Сезоны" className="no-scrollbar -mx-4 mb-6 flex gap-1.5 overflow-x-auto px-4 min-[720px]:mx-0 min-[720px]:flex-wrap min-[720px]:px-0">
          {seasons.map((s) => {
            const active = selected?.id === s.id;
            const current = s.isActive && s.status === "OPEN";
            return (
              <Link
                key={s.id}
                href={`/stats?season=${s.id}`}
                aria-current={active ? "page" : undefined}
                className={`press inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium transition-colors ${
                  active
                    ? "border-[var(--points-border)] bg-[var(--points-bg)] text-[var(--points-ink)]"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:bg-[var(--control)]"
                }`}
              >
                {current && <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" aria-hidden />}
                {SEASON_LABELS[s.name]} {s.year}
                {!current && <span className="text-[11px] opacity-70">архив</span>}
              </Link>
            );
          })}
        </nav>
      )}

      {me && (
        <div className="mb-6 grid grid-cols-2 gap-2.5 min-[720px]:grid-cols-4 min-[720px]:gap-3">
          <StatTile label="Ваше место" value={`#${myIndex + 1}`} hint={`из ${leaderboard.length}`} tone="points" />
          <StatTile label={isArchive ? "Очки сезона" : "Очки"} value={formatPoints(me.totalPoints)} />
          <StatTile
            label="До места выше"
            value={above ? `+${formatPoints(Math.max(0, above.totalPoints - me.totalPoints))}` : "—"}
            hint={above ? `до #${myIndex}` : "вы лидер"}
            tone={above ? "default" : "success"}
          />
          <StatTile label="За всё время" value={formatPoints(me.lifetimePoints ?? me.totalPoints)} />
        </div>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-[17px] min-[720px]:text-[20px]">
            {isArchive ? "Архив" : "Таблица лидеров"} · {seasonLabel}
          </h2>
          {isArchive && <Badge>Сезон закрыт</Badge>}
        </div>
        <p className="text-[13px] text-[var(--text-3)]">
          {selected
            ? isArchive
              ? "Очки закрытого сезона зафиксированы. Текущий счётчик обнуляется при закрытии."
              : "Очки текущего сезона. «За всё время» — сумма по всем сезонам."
            : "Сезонов пока нет — показаны накопленные очки."}
        </p>
        <PointsLeaderboard
          entries={leaderboard}
          viewer={user}
          showLifetime
          seasonColumnLabel={isArchive ? "Очки сезона" : "Очки"}
        />
      </section>

      {closedSeasons.length > 0 && (
        <section className="mt-10 space-y-3">
          <h2 className="text-[17px] min-[720px]:text-[20px]">Архив сезонов</h2>
          <p className="text-[13px] text-[var(--text-3)]">
            При закрытии сезона очки сбрасываются до 0, но таблица остаётся здесь навсегда.
          </p>
          <div className="surface-card divide-y divide-[var(--border-soft)] overflow-hidden">
            {closedSeasons.map((s) => (
              <Link
                key={s.id}
                href={`/stats?season=${s.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3.5 text-sm transition-colors hover:bg-[var(--surface-muted)]"
              >
                <span className="font-medium text-[var(--text)]">
                  {SEASON_LABELS[s.name]} {s.year}
                </span>
                <span className="flex items-center gap-1 text-[var(--text-3)]">
                  {s.closedAt ? `закрыт ${formatShortDate(s.closedAt)}` : "закрыт"}
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
