"use client";

import { Star } from "lucide-react";
import { Avatar } from "@/components/home/Avatar";
import { PlayerLink } from "@/components/PlayerLink";
import { PositionBadge } from "@/components/RoleIcon";
import { DotaImg } from "@/components/match/DotaImg";
import { cn } from "@/lib/utils";
import {
  formatDuration,
  formatK,
  heroInfo,
  itemInfo,
  networthAdvantage,
  packItems,
  purchaseTime,
  type DraftEntry,
  type ReplayPlayer,
} from "@/lib/replay";
import type { LineupSlot } from "@/lib/match-lineup";

export type ReplayView = {
  gameNumber: number;
  durationSec: number;
  radiantWin: boolean | null;
  radiantScore: number;
  direScore: number;
  players: ReplayPlayer[];
  draft: DraftEntry[];
  /** "screenshot" — данные перенесены со скриншотов (демка не сохранилась) */
  source?: "demo" | "screenshot";
  screenshots?: string[];
};

type UserRow = {
  id: string;
  firstName: string;
  lastName?: string | null;
  username?: string | null;
  photoUrl?: string | null;
};
type Viewer = { id: string; role: string };

const ROLE: Record<number, string> = { 1: "Керри", 2: "Мид", 3: "Оффлейн", 4: "Саппорт", 5: "Хард-саппорт" };

/**
 * Раскладываем игроков по позициям 1–5: позиция из нашего состава на эту игру,
 * гости и неизвестные — в свободные позиции по убыванию нетворса.
 */
function byPosition(players: ReplayPlayer[], slots: LineupSlot[]) {
  const posOf = new Map(slots.map((s) => [s.userId, s.position]));
  const out: (ReplayPlayer | null)[] = [null, null, null, null, null];
  const rest: ReplayPlayer[] = [];
  for (const p of players) {
    const pos = p.userId ? posOf.get(p.userId) : undefined;
    if (pos && pos >= 1 && pos <= 5 && !out[pos - 1]) out[pos - 1] = p;
    else rest.push(p);
  }
  rest.sort((a, b) => b.netWorth - a.netWorth);
  for (let i = 0; i < 5 && rest.length; i++) if (!out[i]) out[i] = rest.shift()!;
  return out;
}

/** Итоги игры из демки: драфт + игроки лицом к лицу по позициям */
export function ReplayLanes({
  replay,
  leftSlots,
  rightSlots,
  leftName,
  rightName,
  userMap,
  viewer,
  mvpId,
}: {
  replay: ReplayView;
  leftSlots: LineupSlot[];
  rightSlots: LineupSlot[];
  leftName: string;
  rightName: string;
  userMap: Record<string, UserRow>;
  viewer: Viewer;
  mvpId?: string | null;
}) {
  // Левая колонка — команда, которая слева на табло; в Dota она могла играть за любую сторону
  const leftIds = new Set(leftSlots.map((s) => s.userId));
  const radiantOverlap = replay.players.filter((p) => p.team === "RADIANT" && p.userId && leftIds.has(p.userId)).length;
  const direOverlap = replay.players.filter((p) => p.team === "DIRE" && p.userId && leftIds.has(p.userId)).length;
  const leftSide: "RADIANT" | "DIRE" = direOverlap > radiantOverlap ? "DIRE" : "RADIANT";
  const rightSide = leftSide === "RADIANT" ? "DIRE" : "RADIANT";

  const left = byPosition(replay.players.filter((p) => p.team === leftSide), leftSlots);
  const right = byPosition(replay.players.filter((p) => p.team === rightSide), rightSlots);
  const score = (side: "RADIANT" | "DIRE") => (side === "RADIANT" ? replay.radiantScore : replay.direScore);
  const won = (side: "RADIANT" | "DIRE") =>
    replay.radiantWin == null ? null : (side === "RADIANT") === replay.radiantWin;
  const nwSum = (list: (ReplayPlayer | null)[]) => list.reduce((s, p) => s + (p?.netWorth ?? 0), 0);

  return (
    <div className="mt-4 space-y-4">
      {/* Сводка игры */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-[var(--radius-control)] bg-[var(--surface-muted)] px-3 py-2.5 min-[720px]:px-4">
        <SideSummary side={leftSide} name={leftName} won={won(leftSide)} nw={nwSum(left)} />
        <div className="text-center">
          <p className="font-mono-num text-[20px] font-bold leading-none min-[720px]:text-[24px]">
            {score(leftSide)}
            <span className="mx-1.5 text-[var(--text-4)]">:</span>
            {score(rightSide)}
          </p>
          {replay.durationSec > 0 && (
            <p className="mt-1 font-mono-num text-[11px] text-[var(--text-3)]">{formatDuration(replay.durationSec)}</p>
          )}
        </div>
        <SideSummary side={rightSide} name={rightName} won={won(rightSide)} nw={nwSum(right)} right />
      </div>

      {replay.source === "screenshot" && <ScreenshotNote shots={replay.screenshots ?? []} />}

      {replay.draft.length > 0 && <DraftStrip draft={replay.draft} />}

      <AdvantageChart
        values={networthAdvantage(replay.players).map((v) => (leftSide === "RADIANT" ? v : -v))}
        leftName={leftName}
        rightName={rightName}
      />

      {/* Лицом к лицу по позициям */}
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => {
          const l = left[i];
          const r = right[i];
          if (!l && !r) return null;
          const diff = (l?.netWorth ?? 0) - (r?.netWorth ?? 0);
          return (
            <div
              key={i}
              className="grid grid-cols-1 gap-2 min-[900px]:grid-cols-[minmax(0,1fr)_88px_minmax(0,1fr)] min-[900px]:items-stretch"
            >
              <LaneCenter pos={i + 1} diff={diff} className="min-[900px]:order-2" />
              <div className="min-[900px]:order-1">
                {l && <PlayerCell p={l} side={leftSide} userMap={userMap} viewer={viewer} mvpId={mvpId} />}
              </div>
              <div className="min-[900px]:order-3">
                {r && <PlayerCell p={r} side={rightSide} userMap={userMap} viewer={viewer} mvpId={mvpId} mirrored />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Плашка «данные со скриншотов» + миниатюры, открываются в новой вкладке */
function ScreenshotNote({ shots }: { shots: string[] }) {
  return (
    <div className="rounded-[var(--radius-control)] border border-dashed border-[var(--border)] px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[13px] font-semibold">Данные со скриншота</p>
        <p className="text-[12px] text-[var(--text-3)]">
          Демка не сохранилась — без станов, лога убийств и времени покупок
        </p>
      </div>
      {shots.length > 0 && (
        <div className="no-scrollbar -mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
          {shots.map((src, i) => (
            <a
              key={src}
              href={src}
              target="_blank"
              rel="noreferrer"
              className="block shrink-0 overflow-hidden rounded-[8px] border border-[var(--border-soft)] transition-opacity hover:opacity-80"
              aria-label={`Скриншот ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" loading="lazy" className="h-[54px] w-[96px] object-cover" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function SideSummary({
  side,
  name,
  won,
  nw,
  right,
}: {
  side: "RADIANT" | "DIRE";
  name: string;
  won: boolean | null;
  nw: number;
  right?: boolean;
}) {
  return (
    <div className={cn("min-w-0", right && "text-right")}>
      <p className={cn("flex items-center gap-1.5 text-[12px] font-semibold", right && "flex-row-reverse", side === "RADIANT" ? "text-[var(--success-ink)]" : "text-[var(--danger)]")}>
        {side === "RADIANT" ? "Свет" : "Тьма"}
        {won && (
          <span className="rounded-full bg-[var(--surface)] px-1.5 py-px text-[10px] text-[var(--text)] shadow-[var(--shadow-xs)]">
            Победа
          </span>
        )}
      </p>
      <p className="truncate text-[12px] text-[var(--text-3)]">
        <span className="hidden min-[560px]:inline">{name.replace(/^Team\s+/i, "")} · </span>
        <span className="font-mono-num font-semibold text-[var(--gold-ink)]">{formatK(nw)}</span>
      </p>
    </div>
  );
}

function DraftStrip({ draft }: { draft: DraftEntry[] }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="eyebrow">Драфт</p>
        <span className="flex gap-3 text-[11px] text-[var(--text-3)]">
          <span className="flex items-center gap-1">
            <span className="h-[3px] w-3 bg-[var(--success)]" aria-hidden />
            Свет
          </span>
          <span className="flex items-center gap-1">
            <span className="h-[3px] w-3 bg-[var(--danger)]" aria-hidden />
            Тьма
          </span>
          <span>зачёркнут — бан</span>
        </span>
      </div>
      <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 min-[900px]:overflow-visible">
        {draft.map((d) => {
          const hero = heroInfo(d.heroId);
          return (
            <div
              key={`${d.order}-${d.heroId}`}
              className={cn(
                "relative w-[54px] shrink-0 overflow-hidden rounded-[4px] border-t-[3px] bg-[var(--control)] min-[900px]:w-auto min-[900px]:min-w-0 min-[900px]:max-w-[62px] min-[900px]:flex-1 min-[900px]:shrink",
                d.team === "RADIANT" ? "border-[var(--success)]" : d.team === "DIRE" ? "border-[var(--danger)]" : "border-[var(--border)]"
              )}
              title={`${d.order}. ${d.pick ? "Пик" : "Бан"}: ${hero.name}`}
            >
              <DotaImg
                src={hero.img}
                alt={hero.name}
                className={cn("block aspect-[16/9] w-full object-cover", !d.pick && "opacity-60 grayscale")}
              />
              {!d.pick && (
                <span
                  aria-hidden
                  className="absolute left-[-6px] right-[-6px] top-1/2 h-[2px] -rotate-[28deg] bg-[var(--danger)]"
                />
              )}
              <span className="absolute bottom-0.5 left-0.5 rounded-[3px] bg-black/65 px-1 font-mono-num text-[9px] leading-[13px] text-white">
                {d.order}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LaneCenter({ pos, diff, className }: { pos: number; diff: number; className?: string }) {
  const leftLeads = diff > 0;
  const even = Math.abs(diff) < 100;
  return (
    <div
      className={cn(
        "flex items-center gap-2 min-[900px]:flex-col min-[900px]:justify-center min-[900px]:gap-1.5",
        className
      )}
    >
      <PositionBadge position={pos} className="min-[900px]:h-6 min-[900px]:w-6 min-[900px]:text-[12px]" />
      <span className="text-[12px] font-medium text-[var(--text-2)]">{ROLE[pos]}</span>
      <span
        className={cn(
          "ml-auto rounded-full px-2 py-0.5 font-mono-num text-[11px] font-semibold min-[900px]:ml-0",
          even
            ? "bg-[var(--control)] text-[var(--text-3)]"
            : leftLeads
              ? "bg-[var(--success-bg)] text-[var(--success-ink)]"
              : "bg-[var(--danger-bg)] text-[var(--danger)]"
        )}
        title="Разница в нетворсе"
      >
        {even ? "≈" : leftLeads ? `◀ +${formatK(Math.abs(diff))}` : `+${formatK(Math.abs(diff))} ▶`}
      </span>
    </div>
  );
}

function PlayerCell({
  p,
  side,
  userMap,
  viewer,
  mvpId,
  mirrored,
}: {
  p: ReplayPlayer;
  side: "RADIANT" | "DIRE";
  userMap: Record<string, UserRow>;
  viewer: Viewer;
  mvpId?: string | null;
  mirrored?: boolean;
}) {
  const hero = heroInfo(p.heroId);
  const user = p.userId ? userMap[p.userId] : undefined;
  const me = p.userId === viewer.id;
  const isMvp = Boolean(mvpId && p.userId === mvpId);
  const items = packItems(p.items);
  const neutral = itemInfo(p.neutralItem);
  const fullName = user ? [user.firstName, user.lastName].filter(Boolean).join(" ") : null;

  return (
    <div
      className={cn(
        "flex h-full flex-col gap-2 rounded-[var(--radius-control)] border-s-[3px] px-3 py-2.5 min-[720px]:px-3.5",
        mirrored && "min-[900px]:border-s-0 min-[900px]:border-e-[3px]",
        side === "RADIANT" ? "border-[var(--success)]" : "border-[var(--danger)]",
        me ? "bg-[var(--points-bg)]" : "bg-[var(--surface-muted)]"
      )}
    >
      <div className={cn("flex items-center gap-2.5", mirrored && "min-[900px]:flex-row-reverse")}>
        <span className="relative shrink-0">
          <DotaImg src={hero.img} alt={hero.name} className="h-[32px] w-[56px] rounded-[4px] object-cover min-[720px]:h-[36px] min-[720px]:w-[64px]" />
          {p.level != null && (
            <span className="absolute bottom-0.5 left-0.5 rounded-[3px] bg-black/65 px-1 font-mono-num text-[9px] leading-[13px] text-white">
              {p.level}
            </span>
          )}
        </span>
        {user && (
          <Avatar photoUrl={user.photoUrl} firstName={user.firstName} lastName={user.lastName} size={30} className="hidden min-[400px]:inline-flex" />
        )}
        <div className={cn("min-w-0 flex-1", mirrored && "min-[900px]:text-right")}>
          <p className={cn("flex min-w-0 items-center gap-1.5", mirrored && "min-[900px]:flex-row-reverse")}>
            {user ? (
              <PlayerLink
                user={user}
                viewer={viewer}
                className={cn("min-w-0 truncate text-[14px] font-semibold", me && "text-[var(--points-ink)]")}
              >
                {fullName}
              </PlayerLink>
            ) : (
              <span className="min-w-0 truncate text-[14px] font-semibold text-[var(--text)]">{p.name ?? "Игрок"}</span>
            )}
            {isMvp && <Star className="h-3.5 w-3.5 shrink-0 fill-[var(--warning)] text-[var(--warning)]" aria-label="MVP" />}
            {!user && (
              <span className="shrink-0 rounded-full bg-[var(--control)] px-1.5 py-px text-[10px] font-semibold text-[var(--text-3)]">
                гость
              </span>
            )}
          </p>
          <p className="truncate text-[12px] text-[var(--text-3)]">{hero.name}</p>
        </div>
        <div className={cn("shrink-0 text-right", mirrored && "min-[900px]:text-left")}>
          <p className="font-mono-num text-[14px] font-bold">
            <span className="text-[var(--success-ink)]">{p.kills}</span>
            <span className="text-[var(--text-4)]">/</span>
            <span className="text-[var(--danger)]">{p.deaths}</span>
            <span className="text-[var(--text-4)]">/</span>
            {p.assists}
          </p>
          <p className="font-mono-num text-[12px] font-semibold text-[var(--gold-ink)]">{formatK(p.netWorth)}</p>
        </div>
      </div>

      <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5", mirrored && "min-[900px]:flex-row-reverse")}>
        <div className={cn("flex items-center gap-[3px]", mirrored && "min-[900px]:flex-row-reverse")}>
          {items.map((it, k) => {
            const info = itemInfo(it)!;
            const at = purchaseTime(p, it);
            return (
              <DotaImg
                key={k}
                src={info.img}
                alt={at ? `${info.name} · куплен на ${at}` : info.name}
                className="h-[22px] w-[30px] rounded-[3px] object-cover"
              />
            );
          })}
          {neutral && (
            <DotaImg
              src={neutral.img}
              alt={`Нейтральный: ${neutral.name}`}
              className="ml-1 h-[22px] w-[22px] rounded-full object-cover ring-1 ring-[var(--border)]"
            />
          )}
        </div>
        <dl className={cn("flex flex-wrap gap-x-2.5 gap-y-0.5 font-mono-num text-[11px] text-[var(--text-3)]", mirrored ? "min-[900px]:mr-auto" : "min-[900px]:ml-auto")}>
          <div title="Добито / заденаено" className="font-semibold text-[var(--text-2)]">
            {p.lastHits}/{p.denies}
          </div>
          {p.gpm != null && <Stat label="ЗМ" value={String(p.gpm)} />}
          {p.xpm != null && <Stat label="ОМ" value={String(p.xpm)} />}
        </dl>
      </div>
    </div>
  );
}

function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex gap-1" title={title}>
      <dt>{label}</dt>
      <dd className="font-semibold text-[var(--text-2)]">{value}</dd>
    </div>
  );
}

/** График преимущества по нетворсу (плюс — в пользу левой команды) */
function AdvantageChart({ values, leftName, rightName }: { values: number[]; leftName: string; rightName: string }) {
  if (values.length < 3) return null;
  const W = 600;
  const H = 120;
  const maxAbs = Math.max(1000, ...values.map((v) => Math.abs(v)));
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => H / 2 - (v / maxAbs) * (H / 2 - 6);
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H / 2} L0,${H / 2} Z`;
  const peakLeft = Math.max(0, ...values);
  const peakRight = Math.max(0, ...values.map((v) => -v));
  const last = values[values.length - 1];
  const clipId = `adv-${values.length}-${Math.round(maxAbs)}`;
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
        <p className="eyebrow">Преимущество по золоту</p>
        <p className="text-[11px] text-[var(--text-3)]">
          пик: <span className="font-semibold text-[var(--success-ink)]">{leftName.replace(/^Team\s+/i, "")} +{formatK(peakLeft)}</span>
          {" · "}
          <span className="font-semibold text-[var(--danger)]">{rightName.replace(/^Team\s+/i, "")} +{formatK(peakRight)}</span>
        </p>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-[110px] w-full rounded-[var(--radius-control)] bg-[var(--surface-muted)]"
        role="img"
        aria-label={`Преимущество по золоту к концу игры: ${last >= 0 ? leftName : rightName} +${formatK(Math.abs(last))}`}
      >
        <defs>
          <clipPath id={`${clipId}-top`}>
            <rect x="0" y="0" width={W} height={H / 2} />
          </clipPath>
          <clipPath id={`${clipId}-bottom`}>
            <rect x="0" y={H / 2} width={W} height={H / 2} />
          </clipPath>
        </defs>
        <path d={area} fill="var(--success)" opacity="0.18" clipPath={`url(#${clipId}-top)`} />
        <path d={area} fill="var(--danger)" opacity="0.18" clipPath={`url(#${clipId}-bottom)`} />
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="var(--border)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <path d={line} fill="none" stroke="var(--text-2)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between font-mono-num text-[10px] text-[var(--text-4)]">
        <span>0:00</span>
        <span>{Math.round((values.length - 1) / 2)}:00</span>
        <span>{values.length - 1}:00</span>
      </div>
    </div>
  );
}
