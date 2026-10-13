"use client";

import { useState } from "react";
import Link from "next/link";
import { Segmented } from "@/components/ui/segmented";
import { cn, playerProfilePath } from "@/lib/utils";
import { formatDuration, formatK, heroInfo, itemInfo, type ReplayPlayer } from "@/lib/replay";

export type ReplayView = {
  gameNumber: number;
  durationSec: number;
  radiantWin: boolean | null;
  radiantScore: number;
  direScore: number;
  players: ReplayPlayer[];
};

/** Картинка героя/предмета со Steam CDN; если не загрузилась — серая плашка */
function DotaImg({ src, alt, className, round }: { src: string; alt: string; className: string; round?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        title={alt}
        className={cn(className, "flex items-center justify-center bg-[var(--control)] text-[9px] font-semibold text-[var(--text-3)]", round && "rounded-full")}
      >
        {alt.slice(0, 2)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} title={alt} className={className} loading="lazy" onError={() => setFailed(true)} />
  );
}

type NameRow = { id: string; firstName: string; lastName?: string | null };

const COLS =
  "min-[900px]:grid-cols-[minmax(0,1.6fr)_40px_96px_80px_72px_64px_minmax(0,1.7fr)]";

/** Таблица матча из демки — в духе итогового экрана Dota */
export function MatchReplays({
  replays,
  names,
  viewer,
}: {
  replays: ReplayView[];
  names: Record<string, NameRow>;
  viewer: { id: string; role: string };
}) {
  const sorted = [...replays].sort((a, b) => a.gameNumber - b.gameNumber);
  const [game, setGame] = useState(String(sorted[sorted.length - 1]?.gameNumber ?? 1));
  const r = sorted.find((x) => String(x.gameNumber) === game) ?? sorted[0];
  if (!r) return null;

  const maxNw = Math.max(1, ...r.players.map((p) => p.netWorth));

  return (
    <section className="border-t border-[var(--border-soft)] px-4 py-4 min-[720px]:px-6 min-[720px]:py-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="eyebrow">Статистика из демки</p>
          <p className="text-[13px] text-[var(--text-2)]">
            Игра {r.gameNumber}
            {r.durationSec > 0 && (
              <>
                {" · "}
                <span className="font-mono-num">{formatDuration(r.durationSec)}</span>
              </>
            )}
          </p>
        </div>
        {sorted.length > 1 && (
          <Segmented
            stretch={false}
            value={game}
            onChange={setGame}
            items={sorted.map((x) => ({ value: String(x.gameNumber), label: `Игра ${x.gameNumber}` }))}
          />
        )}
      </div>

      <div className="space-y-3">
        {(["RADIANT", "DIRE"] as const).map((team) => {
          const list = r.players.filter((p) => p.team === team);
          const won = r.radiantWin == null ? null : (team === "RADIANT") === r.radiantWin;
          const score = team === "RADIANT" ? r.radiantScore : r.direScore;
          const teamNw = list.reduce((s, p) => s + p.netWorth, 0);
          return (
            <div key={team} className="overflow-hidden rounded-[var(--radius-control)] border border-[var(--border)]">
              <div
                className={cn(
                  "flex items-center justify-between gap-2 px-3 py-2 text-[13px] font-semibold",
                  team === "RADIANT"
                    ? "bg-[var(--success-bg)] text-[var(--success-ink)]"
                    : "bg-[var(--danger-bg)] text-[var(--danger)]"
                )}
              >
                <span className="flex items-center gap-2">
                  {team === "RADIANT" ? "Силы Света" : "Силы Тьмы"}
                  {won && (
                    <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[11px]">Победа</span>
                  )}
                </span>
                <span className="font-mono-num">
                  {score} · {formatK(teamNw)}
                </span>
              </div>

              <div
                className={cn(
                  "hidden gap-2 bg-[var(--surface-muted)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)] min-[900px]:grid",
                  COLS
                )}
              >
                <span>Игрок</span>
                <span className="text-center">Ур.</span>
                <span className="text-center">У / С / П</span>
                <span className="text-right">Нетворс</span>
                <span className="text-right">ЛХ / ДН</span>
                <span className="text-right">Урон</span>
                <span>Предметы</span>
              </div>

              <ul className="divide-y divide-[var(--border-soft)]">
                {list.map((p, i) => {
                  const hero = heroInfo(p.heroId);
                  const user = p.userId ? names[p.userId] : undefined;
                  const label = user
                    ? [user.firstName, user.lastName].filter(Boolean).join(" ")
                    : (p.name ?? "Игрок");
                  const me = p.userId === viewer.id;
                  const neutral = itemInfo(p.neutralItem);
                  return (
                    <li
                      key={i}
                      className={cn(
                        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 px-3 py-2",
                        COLS,
                        me && "bg-[var(--points-bg)]"
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        {hero.img ? (
                          <DotaImg src={hero.img} alt={hero.name} className="h-[30px] w-[54px] shrink-0 rounded-[4px] object-cover" />
                        ) : (
                          <span className="h-[30px] w-[54px] shrink-0 rounded-[4px] bg-[var(--control)]" />
                        )}
                        <div className="min-w-0">
                          {user ? (
                            <Link
                              href={playerProfilePath(user.id, viewer)}
                              className="block truncate text-[13px] font-semibold text-[var(--points)] hover:underline"
                            >
                              {label}
                            </Link>
                          ) : (
                            <span className="block truncate text-[13px] font-semibold text-[var(--text)]">{label}</span>
                          )}
                          <span className="block truncate text-[11px] text-[var(--text-3)]">{hero.name}</span>
                        </div>
                      </div>

                      {/* Телефон: K/D/A и нетворс справа */}
                      <div className="text-right min-[900px]:hidden">
                        <span className="block font-mono-num text-[13px] font-bold text-[var(--text)]">
                          {p.kills}/{p.deaths}/{p.assists}
                        </span>
                        <span className="block font-mono-num text-[11px] text-[var(--gold-ink)]">{formatK(p.netWorth)}</span>
                      </div>

                      <span className="hidden text-center font-mono-num text-[13px] text-[var(--text-2)] min-[900px]:block">
                        {p.level ?? "—"}
                      </span>
                      <span className="hidden text-center font-mono-num text-[13px] font-semibold min-[900px]:block">
                        <span className="text-[var(--success-ink)]">{p.kills}</span>
                        <span className="text-[var(--text-3)]"> / </span>
                        <span className="text-[var(--danger)]">{p.deaths}</span>
                        <span className="text-[var(--text-3)]"> / </span>
                        <span>{p.assists}</span>
                      </span>
                      <span className="hidden min-[900px]:block">
                        <span className="block text-right font-mono-num text-[13px] font-semibold text-[var(--gold-ink)]">
                          {formatK(p.netWorth)}
                        </span>
                        <span className="mt-0.5 block h-1 overflow-hidden rounded-full bg-[var(--control)]">
                          <span
                            className="block h-full rounded-full bg-[var(--gold)]"
                            style={{ width: `${(p.netWorth / maxNw) * 100}%` }}
                          />
                        </span>
                      </span>
                      <span className="hidden text-right font-mono-num text-[13px] text-[var(--text-2)] min-[900px]:block">
                        {p.lastHits} / {p.denies}
                      </span>
                      <span className="hidden text-right font-mono-num text-[13px] text-[var(--text-2)] min-[900px]:block">
                        {formatK(p.heroDamage)}
                      </span>

                      <div className="col-span-2 flex flex-wrap items-center gap-1 min-[900px]:col-span-1">
                        {p.items.map((it, k) => {
                          const info = itemInfo(it);
                          return info ? (
                            <DotaImg key={k} src={info.img} alt={info.name} className="h-[22px] w-[30px] rounded-[3px] object-cover" />
                          ) : (
                            <span key={k} className="h-[22px] w-[30px] rounded-[3px] bg-[var(--control)]" />
                          );
                        })}
                        {neutral && (
                          <DotaImg
                            src={neutral.img}
                            alt={`Нейтральный: ${neutral.name}`}
                            round
                            className="ml-1 h-[22px] w-[22px] rounded-full object-cover ring-1 ring-[var(--border)]"
                          />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
