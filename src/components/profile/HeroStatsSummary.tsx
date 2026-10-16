import Link from "next/link";
import { DotaImg } from "@/components/match/DotaImg";
import { heroInfo, plural } from "@/lib/replay";
import type { ReplayStats } from "@/lib/replay-stats";
import { cn } from "@/lib/utils";

const pct = (w: number, g: number) => (g ? Math.round((w / g) * 100) : 0);

/** Компактный блок «Мои герои» на вкладке «Обзор» */
export function HeroStatsSummary({ stats, isOwn }: { stats: ReplayStats; isOwn: boolean }) {
  if (stats.games === 0) return null;
  const top = stats.heroes.slice(0, 3);
  const rest = stats.heroes.length - top.length;
  const kda = (h: { kills: number; deaths: number; assists: number }) =>
    (h.deaths ? (h.kills + h.assists) / h.deaths : h.kills + h.assists).toFixed(1);

  return (
    <section className="surface-card space-y-4 px-4 py-4 min-[720px]:px-6 min-[720px]:py-5" aria-labelledby="my-heroes-h">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Из демок · {stats.games} {plural(stats.games, "игра", "игры", "игр")}</p>
          <h3 id="my-heroes-h" className="font-display text-[17px] font-semibold">
            {isOwn ? "Мои герои" : "Герои"}
          </h3>
        </div>
        <Link
          href="?tab=heroes"
          className="press inline-flex h-9 shrink-0 items-center rounded-[var(--radius-control)] bg-[var(--points-bg)] px-3 text-[13px] font-semibold text-[var(--points-ink)] transition-colors hover:bg-[var(--points-border)]"
        >
          Вся статистика
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 text-[13px] text-[var(--text-2)]">
        <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--surface-muted)] px-3">
          Винрейт <b className="font-mono-num text-[var(--text)]">{pct(stats.wins, stats.wins + stats.losses)}%</b>
        </span>
        <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--surface-muted)] px-3">
          K/D/A{" "}
          <b className="font-mono-num text-[var(--text)]">
            {stats.avg.kills} / {stats.avg.deaths} / {stats.avg.assists}
          </b>
        </span>
        <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--surface-muted)] px-3">
          Ур. <b className="font-mono-num text-[var(--text)]">{stats.avg.level}</b>
        </span>
      </div>

      <div className="grid gap-3 min-[560px]:grid-cols-2 lg:grid-cols-3">
        {top.map((h, i) => {
          const info = heroInfo(h.heroId);
          const wr = pct(h.wins, h.games);
          return (
            <article key={h.heroId} className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-soft)]">
              <div className="relative">
                <DotaImg
                  src={info.banner ?? info.img}
                  alt={info.name}
                  className="block aspect-[16/9] max-h-[124px] w-full object-cover object-top"
                />
                <span className="absolute left-2.5 top-2.5 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">
                  №{i + 1} · {h.games} {plural(h.games, "игра", "игры", "игр")}
                </span>
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-6 font-display text-[16px] font-semibold text-white">
                  {info.name}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 px-3 pb-2 pt-2.5">
                <div>
                  <p className="text-[11px] text-[var(--text-3)]">Игры</p>
                  <p className="font-mono-num text-[16px] font-bold">{h.games}</p>
                </div>
                <div>
                  <p className="text-[11px] text-[var(--text-3)]">Винрейт</p>
                  <p className={cn("font-mono-num text-[16px] font-bold", wr >= 50 ? "text-[var(--success-ink)]" : "text-[var(--danger)]")}>
                    {wr}%
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-[var(--text-3)]">KDA</p>
                  <p className="font-mono-num text-[16px] font-bold">{kda(h)}</p>
                </div>
              </div>
              <span className="mx-3 mb-3 flex h-1.5 overflow-hidden rounded-full bg-[var(--danger-bg)]" aria-hidden>
                <span className="rounded-full bg-[var(--success)]" style={{ width: `${wr}%` }} />
              </span>
            </article>
          );
        })}
      </div>

      {rest > 0 && (
        <p className="text-[12px] text-[var(--text-3)]">
          Ещё {rest} {rest === 1 ? "герой" : rest < 5 ? "героя" : "героев"} и личные рекорды — во вкладке «Герои»
        </p>
      )}
    </section>
  );
}
