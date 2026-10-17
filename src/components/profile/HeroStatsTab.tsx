"use client";

import { useMemo, useState } from "react";
import { Avatar } from "@/components/home/Avatar";
import { PlayerLink } from "@/components/PlayerLink";
import { DotaImg } from "@/components/match/DotaImg";
import { Segmented } from "@/components/ui/segmented";
import { StatTile } from "@/components/ui/page-header";
import { formatShortDate } from "@/lib/format";
import { formatDuration, formatK, heroInfo, itemInfo, plural } from "@/lib/replay";
import type { ReplayStats } from "@/lib/replay-stats";
import { cn } from "@/lib/utils";

type Viewer = { id: string; role: string } | null;

const pct = (w: number, g: number) => (g ? Math.round((w / g) * 100) : 0);

function Kda({ k, d, a, className }: { k: number; d: number; a: number; className?: string }) {
  return (
    <span className={cn("font-mono-num font-semibold", className)}>
      <span className="text-[var(--success-ink)]">{k}</span>
      <span className="text-[var(--text-4)]">/</span>
      <span className="text-[var(--danger)]">{d}</span>
      <span className="text-[var(--text-4)]">/</span>
      {a}
    </span>
  );
}

function WinBar({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("flex h-1.5 overflow-hidden rounded-full bg-[var(--danger-bg)]", className)} aria-hidden>
      <span className="rounded-full bg-[var(--success)]" style={{ width: `${value}%` }} />
    </span>
  );
}

export function HeroStatsEmpty({ isOwn }: { isOwn: boolean }) {
  return (
    <div className="surface-card px-5 py-8 text-center">
      <p className="font-display text-[16px] font-semibold">Пока нет игр с демкой</p>
      <p className="mx-auto mt-1 max-w-[420px] text-[13px] text-[var(--text-3)]">
        {isOwn
          ? "Статистика появится, когда тренер загрузит демку игры, в которой ты играл. Проверь, что в профиле указан Steam ID — по нему тебя узнают в демке."
          : "Статистика появится, когда тренер загрузит демку игры с этим игроком."}
      </p>
    </div>
  );
}

/** Вкладка «Герои»: статистика по загруженным демкам */
export function HeroStatsTab({ stats, viewer, isOwn }: { stats: ReplayStats; viewer: Viewer; isOwn: boolean }) {
  const [sort, setSort] = useState<"games" | "winrate">("games");
  const heroes = useMemo(() => {
    const list = [...stats.heroes];
    if (sort === "winrate") list.sort((a, b) => pct(b.wins, b.games) - pct(a.wins, a.games) || b.games - a.games);
    return list;
  }, [stats.heroes, sort]);
  const kdaRatio = stats.avg.deaths ? (stats.avg.kills + stats.avg.assists) / stats.avg.deaths : stats.avg.kills + stats.avg.assists;

  return (
    <div className="space-y-5">
      {stats.games > 0 ? (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-[18px] min-[720px]:text-[22px]">Статистика из демок</h2>
            <p className="text-[13px] text-[var(--text-3)]">
              По {stats.games} {plural(stats.games, "игре", "играм", "играм")} с загруженной демкой · всего сыграно {stats.totalPlayed}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 [&>*:last-child]:col-span-2 min-[900px]:grid-cols-5 min-[900px]:gap-3 min-[900px]:[&>*:last-child]:col-span-1">
            <StatTile
              label="Винрейт"
              value={`${pct(stats.wins, stats.wins + stats.losses)}%`}
              hint={
                <>
                  <span className="font-semibold text-[var(--success-ink)]">{stats.wins} В</span> ·{" "}
                  <span className="font-semibold text-[var(--danger)]">{stats.losses} П</span>
                </>
              }
            />
            <StatTile
              label="Средний K / D / A"
              value={<Kda k={stats.avg.kills} d={stats.avg.deaths} a={stats.avg.assists} />}
              hint={`KDA ${kdaRatio.toFixed(1)}`}
            />
            <StatTile label="GPM" value={stats.avg.gpm} hint="золото в минуту · среднее" />
            <StatTile label="Добивания" value={stats.avg.lastHits} hint={`в среднем · денаев ${stats.avg.denies}`} />
            <StatTile
              label="Нетворс"
              value={<span className="text-[var(--gold-ink)]">{formatK(stats.avg.netWorth)}</span>}
              hint="в среднем к концу игры"
            />
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            {/* Пул героев */}
            <section className="surface-card overflow-hidden" aria-labelledby="pool-h">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3 pt-4 min-[720px]:px-5">
                <h3 id="pool-h" className="text-[16px] font-semibold">Пул героев</h3>
                <Segmented
                  stretch={false}
                  value={sort}
                  onChange={setSort}
                  items={[
                    { value: "games", label: "По играм" },
                    { value: "winrate", label: "По винрейту" },
                  ]}
                />
              </div>
              <div className="hidden grid-cols-[minmax(0,1.6fr)_56px_minmax(0,1.2fr)_112px_72px] gap-3 border-y border-[var(--border-soft)] bg-[var(--surface-muted)] px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-3)] min-[720px]:grid">
                <span>Герой</span>
                <span className="text-right">Игры</span>
                <span>Винрейт</span>
                <span className="text-right">K / D / A</span>
                <span className="text-right">Нетворс</span>
              </div>
              <ul>
                {heroes.map((h) => {
                  const info = heroInfo(h.heroId);
                  const wr = pct(h.wins, h.games);
                  return (
                    <li
                      key={h.heroId}
                      className="flex items-center gap-3 border-t border-[var(--border-soft)] px-4 py-2.5 first:border-t-0 min-[720px]:grid min-[720px]:grid-cols-[minmax(0,1.6fr)_56px_minmax(0,1.2fr)_112px_72px] min-[720px]:px-5"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <DotaImg src={info.img} alt={info.name} className="h-[30px] w-[52px] shrink-0 rounded-[5px] object-cover min-[720px]:h-[36px] min-[720px]:w-[64px]" />
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-semibold">{info.name}</p>
                          <p className="truncate text-[12px] text-[var(--text-3)]">последняя игра {formatShortDate(h.lastPlayed)}</p>
                        </div>
                      </div>
                      {/* Телефон: компактно справа */}
                      <div className="ml-auto text-right min-[720px]:hidden">
                        <p className="font-mono-num text-[13px] font-semibold">{wr}%</p>
                        <p className="text-[11px] text-[var(--text-3)]">
                          {h.games} {plural(h.games, "игра", "игры", "игр")} · <Kda k={h.kills} d={h.deaths} a={h.assists} />
                        </p>
                      </div>
                      <span className="hidden text-right font-mono-num text-[14px] font-semibold min-[720px]:block">{h.games}</span>
                      <div className="hidden items-center gap-2.5 min-[720px]:flex">
                        <WinBar value={wr} className="flex-1" />
                        <span className="w-10 text-right font-mono-num text-[13px] font-semibold">{wr}%</span>
                      </div>
                      <Kda k={h.kills} d={h.deaths} a={h.assists} className="hidden text-right text-[13px] min-[720px]:block" />
                      <span className="hidden text-right font-mono-num text-[13px] font-semibold text-[var(--gold-ink)] min-[720px]:block">
                        {formatK(h.netWorth)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Рекорды */}
            <section className="surface-card space-y-3 px-4 py-4 min-[720px]:px-5" aria-labelledby="rec-h">
              <h3 id="rec-h" className="text-[16px] font-semibold">Личные рекорды</h3>
              <ul className="space-y-3">
                {stats.records.map((r) => {
                  const info = heroInfo(r.heroId);
                  return (
                    <li key={r.key} className="flex items-center gap-3">
                      <DotaImg src={info.img} alt={info.name} className="h-[26px] w-[44px] shrink-0 rounded-[4px] object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{r.label}</p>
                        <p className="truncate text-[11px] text-[var(--text-3)]">
                          {info.name} · {formatShortDate(r.date)}
                        </p>
                      </div>
                      <span className="font-mono-num text-[15px] font-bold">
                        {r.key === "netWorth" ? formatK(r.value) : r.value}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        </>
      ) : (
        <HeroStatsEmpty isOwn={isOwn} />
      )}

      {(stats.recent.length > 0 || stats.mates.length > 0) && (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          {stats.recent.length > 0 ? (
            <section className="surface-card overflow-hidden" aria-labelledby="last-h">
              <h3 id="last-h" className="px-4 pb-3 pt-4 text-[16px] font-semibold min-[720px]:px-5">
                Последние игры
              </h3>
              <ul>
                {stats.recent.map((g) => {
                  const info = heroInfo(g.heroId);
                  const res = g.won == null ? null : g.won ? "Победа" : "Поражение";
                  return (
                    <li
                      key={`${g.sessionId}-${g.gameNumber}`}
                      className="flex items-center gap-3 border-t border-[var(--border-soft)] py-2.5 pl-3 pr-4 min-[720px]:pl-4 min-[720px]:pr-5"
                    >
                      <span
                        className={cn(
                          "h-9 w-1 shrink-0 rounded-full",
                          g.won == null ? "bg-[var(--border)]" : g.won ? "bg-[var(--success)]" : "bg-[var(--danger)]"
                        )}
                        aria-hidden
                      />
                      <DotaImg src={info.img} alt={info.name} className="h-[30px] w-[52px] shrink-0 rounded-[5px] object-cover min-[720px]:h-[36px] min-[720px]:w-[64px]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold">
                          {info.name}
                          {res && (
                            <span className={cn("font-medium", g.won ? "text-[var(--success-ink)]" : "text-[var(--danger)]")}> · {res}</span>
                          )}
                        </p>
                        <p className="truncate text-[12px] text-[var(--text-3)]">
                          {formatShortDate(g.date)} · игра {g.gameNumber}
                          {g.durationSec > 0 && ` · ${formatDuration(g.durationSec)}`}
                        </p>
                      </div>
                      <div className="hidden items-center gap-[3px] min-[900px]:flex">
                        {g.items.slice(0, 6).map((it, i) => {
                          const item = itemInfo(it)!;
                          return <DotaImg key={i} src={item.img} alt={item.name} className="h-[20px] w-[27px] rounded-[3px] object-cover" />;
                        })}
                      </div>
                      <div className="w-[74px] shrink-0 text-right">
                        <Kda k={g.kills} d={g.deaths} a={g.assists} className="block text-[13px]" />
                        <span className="font-mono-num text-[12px] font-semibold text-[var(--gold-ink)]">{formatK(g.netWorth)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : (
            <div className="hidden lg:block" />
          )}

          {stats.mates.length > 0 && (
            <section className="surface-card space-y-3 px-4 py-4 min-[720px]:px-5" aria-labelledby="mates-h">
              <div>
                <h3 id="mates-h" className="text-[16px] font-semibold">С кем побеждаешь чаще</h3>
                <p className="text-[12px] text-[var(--text-3)]">По всем играм 5v5, от 3 игр вместе</p>
              </div>
              <ul className="space-y-3">
                {stats.mates.map((m) => (
                  <li key={m.userId} className="flex items-center gap-2.5">
                    <Avatar photoUrl={m.photoUrl} firstName={m.firstName} lastName={m.lastName} size={32} />
                    <div className="min-w-0 flex-1">
                      <PlayerLink
                        user={{ id: m.userId, firstName: m.firstName, lastName: m.lastName, username: m.username }}
                        viewer={viewer}
                        className="block truncate text-[13px] font-semibold"
                      />
                      <p className="text-[11px] text-[var(--text-3)]">
                        {m.games} {plural(m.games, "игра", "игры", "игр")} вместе · {m.wins} {plural(m.wins, "победа", "победы", "побед")}
                      </p>
                    </div>
                    <span className="font-mono-num text-[14px] font-bold text-[var(--success-ink)]">{pct(m.wins, m.games)}%</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
