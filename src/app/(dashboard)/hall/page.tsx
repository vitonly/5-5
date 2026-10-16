import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { initials } from "@/lib/format";
import { PlayerLink } from "@/components/PlayerLink";
import { DotaImg } from "@/components/match/DotaImg";
import { computeHall, getSeasonHall, HALL_GROUP_LABELS, HALL_POINTS, NOMINATIONS, type HallGroup, type HallRecord } from "@/lib/hall-of-fame";
import { heroInfo } from "@/lib/replay";
import { formatShortDate } from "@/lib/format";
import { SEASON_LABELS } from "@/lib/labels";
import { cn, displayName } from "@/lib/utils";

export const metadata = { title: "Зал славы 5v5" };
export const dynamic = "force-dynamic";

const GROUPS: HallGroup[] = ["core", "support", "general", "anti"];

export default async function HallOfFamePage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const user = await getSessionUser();
  if (!user) return null;
  const { scope } = await searchParams;
  const allTime = scope === "all";

  const seasonHall = allTime ? null : await getSeasonHall();
  const records = allTime ? await computeHall() : seasonHall!.records;
  const season = seasonHall?.season
    ? await prisma.ratingSeason.findUnique({ where: { id: seasonHall.season.id }, select: { name: true, year: true } })
    : null;

  const ids = [...new Set(records.flatMap((r) => (r ? [r.userId, ...(r.previous ? [r.previous.userId] : [])] : [])))];
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, firstName: true, lastName: true, username: true, photoUrl: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));
  const viewer = { id: user.id, role: user.role };

  return (
    <div>
      <PageHeader eyebrow="Рекорды по демкам" title="Зал славы" className="mb-5 min-[720px]:mb-6" />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Период" className="inline-flex gap-1 rounded-[var(--radius-control)] bg-[var(--control)] p-1">
          {[
            { href: "/hall", label: season ? `Сезон · ${SEASON_LABELS[season.name]} ${season.year}` : "Сезон", active: !allTime },
            { href: "/hall?scope=all", label: "За всё время", active: allTime },
          ].map((t) => (
            <Link
              key={t.href}
              href={t.href}
              role="tab"
              aria-selected={t.active}
              className={cn(
                "press flex min-h-[40px] items-center rounded-[var(--radius-sm)] px-4 text-sm font-medium transition-colors",
                t.active ? "bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-xs)]" : "text-[var(--text-2)] hover:text-[var(--text)]"
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <p className="max-w-[560px] text-[13px] text-[var(--text-3)]">
          {allTime
            ? "Лучшие результаты за всю историю школы — только почёт, без очков."
            : `Рекорд сезона даёт +${HALL_POINTS} очка, антирекорд −${HALL_POINTS}. Перебили — очки переходят новому держателю.`}
        </p>
      </div>

      {!allTime && !seasonHall?.season ? (
        <p className="surface-card px-4 py-10 text-center text-sm text-[var(--text-3)]">Сезон не открыт — рекорды сезона появятся после старта.</p>
      ) : (
        <div className="space-y-8">
          {GROUPS.map((g) => {
            const items = NOMINATIONS.map((n, i) => ({ n, r: records[i] })).filter((x) => x.n.group === g);
            return (
              <section key={g} aria-labelledby={`hall-${g}`}>
                <h2 id={`hall-${g}`} className={cn("mb-3 text-[17px] min-[720px]:text-[19px]", g === "anti" && "text-[var(--danger)]")}>
                  {HALL_GROUP_LABELS[g]}
                </h2>
                <div className="grid gap-3 min-[640px]:grid-cols-2 xl:grid-cols-3">
                  {items.map(({ n, r }) => (
                    <RecordCard key={n.code} title={n.title} record={r} anti={g === "anti"} userMap={userMap} viewer={viewer} allTime={allTime} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

type U = { id: string; firstName: string; lastName: string | null; username: string | null; photoUrl: string | null };

function RecordCard({
  title,
  record,
  anti,
  userMap,
  viewer,
  allTime,
}: {
  title: string;
  record: HallRecord | null;
  anti: boolean;
  userMap: Map<string, U>;
  viewer: { id: string; role: string };
  allTime: boolean;
}) {
  const u = record ? userMap.get(record.userId) : undefined;
  const prev = record?.previous ? userMap.get(record.previous.userId) : undefined;
  const hero = record ? heroInfo(record.heroId) : null;
  const me = record?.userId === viewer.id;

  return (
    <article
      className={cn(
        "surface-card relative flex flex-col gap-3 p-3 min-[400px]:p-4",
        me && "ring-2 ring-[var(--points-border)]"
      )}
    >
      {record && u && hero ? (
        <>
          {!allTime && (
            <span
              aria-label={anti ? `−${HALL_POINTS} очка` : `+${HALL_POINTS} очка`}
              className={cn(
                "absolute -right-1.5 -top-1.5 z-10 flex h-8 w-8 items-center justify-center rounded-full font-mono-num text-[12px] font-bold text-white shadow-[var(--shadow-xs)]",
                anti ? "bg-[var(--danger)]" : "bg-[var(--success)]"
              )}
            >
              {anti ? "−" : "+"}
              {HALL_POINTS}
            </span>
          )}
          <div className="grid grid-cols-[minmax(0,44%)_minmax(0,1fr)] gap-3 min-[400px]:gap-4">
            {/* Фото игрока */}
            <div className="relative aspect-[3/4] overflow-hidden rounded-[var(--radius-control)] bg-[var(--control)]">
              {u.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={u.photoUrl} alt={displayName(u)} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center font-display text-[32px] font-bold text-[var(--text-3)]">
                  {initials(u.firstName, u.lastName)}
                </span>
              )}
              {/* ~40% от прежнего bg-black/55 */}
              <span className="absolute inset-x-0 bottom-0 flex justify-center bg-black/20 px-2 py-1.5">
                <PlayerLink
                  user={u}
                  viewer={viewer}
                  className="max-w-full truncate text-center text-[13px] font-semibold text-white hover:text-white"
                >
                  {me ? "Ты" : displayName(u)}
                </PlayerLink>
              </span>
            </div>

            {/* Рекорд · число · герой */}
            <div className="flex min-w-0 flex-col items-center text-center">
              <p className="w-full text-[13px] font-semibold leading-snug text-[var(--text-2)]">{title}</p>
              <div className="flex flex-1 flex-col items-center justify-center py-1">
                <p
                  className={cn(
                    "font-mono-num text-[30px] font-bold leading-none min-[400px]:text-[36px]",
                    anti ? "text-[var(--danger)]" : "text-[var(--text)]"
                  )}
                >
                  {record.display}
                </p>
              </div>
              <div className="flex flex-col items-center gap-1">
                <DotaImg
                  src={hero.img}
                  alt={hero.name}
                  className={cn(
                    "h-[72px] w-[72px] rounded-full object-cover ring-2 min-[400px]:h-[84px] min-[400px]:w-[84px]",
                    anti ? "ring-[var(--danger-bg)]" : "ring-[var(--gold-light)]"
                  )}
                />
                <span className="max-w-full truncate text-[12px] text-[var(--text-3)]">{hero.name}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-[var(--border-soft)] pt-2.5 text-[12px] text-[var(--text-3)]">
            <span className="min-w-0 truncate">
              {formatShortDate(record.date)}
              {prev && record.previous ? ` · побил ${displayName(prev)} (${record.previous.display})` : ""}
            </span>
            <Link
              href={`/match?open=${record.sessionId}&game=${record.gameNumber}#m-${record.sessionId}`}
              className="shrink-0 font-medium text-[var(--points)] hover:underline"
            >
              Игра {record.gameNumber} →
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="text-[13px] font-semibold leading-snug text-[var(--text-2)]">{title}</p>
          <p className="py-6 text-[13px] text-[var(--text-3)]">
            {anti ? "Пока никто не «отличился»." : "Рекорд ещё не установлен — стань первым."}
          </p>
        </>
      )}
    </article>
  );
}
