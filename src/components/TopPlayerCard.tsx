import Link from "next/link";
import { ViewTransition } from "react";
import { PowerPill } from "@/components/StatPills";
import { CountUp } from "@/components/fx/CountUp";
import { TiltCard } from "@/components/fx/TiltCard";
import { PENNANT_CLIP } from "@/lib/fx";
import { cn, shortDisplayName, playerProfilePath } from "@/lib/utils";
import { initials } from "@/lib/format";
import { DOTA_ROLE_LABELS } from "@/lib/labels";
import { formatPoints } from "@/lib/points";
import type { DotaRole } from "@prisma/client";

export interface TopPlayer {
  id: string;
  firstName: string;
  lastName?: string | null;
  username?: string | null;
  photoUrl?: string | null;
  finalRating: number;
  rankTier?: number | null;
  seasonCoefficient?: number;
  mmr?: number | null;
  primaryRole?: DotaRole | null;
  wins: number;
  losses: number;
  totalPoints: number;
}

/* Один рендер на все ширины: телефон — компактный подиум, ≥720px — крупный. */
const SIZE = {
  first: "w-[118px] min-[400px]:w-[132px] min-[720px]:w-[250px] aspect-[25/32]",
  other: "w-[98px] min-[400px]:w-[110px] min-[720px]:w-[212px] aspect-[53/70]",
};

const MEDAL = {
  1: {
    frame: "linear-gradient(180deg, var(--gold-light), var(--gold))",
    numeral: "var(--gold-light)",
    shadow: "drop-shadow(0 18px 36px rgba(201, 151, 28, 0.32))",
  },
  2: {
    frame: "linear-gradient(180deg, var(--silver-light), var(--silver))",
    numeral: "#ffffff",
    shadow: "drop-shadow(0 10px 24px rgba(86, 97, 106, 0.22))",
  },
  3: {
    frame: "linear-gradient(180deg, var(--bronze-light), var(--bronze))",
    numeral: "#ffffff",
    shadow: "drop-shadow(0 10px 24px rgba(154, 100, 56, 0.24))",
  },
} as const;

function medalOf(rank: number) {
  return MEDAL[(rank >= 1 && rank <= 3 ? rank : 3) as 1 | 2 | 3];
}

/** Рамка цвета медали: золото, серебро, бронза */
function Frame({ rank, children }: { rank: number; children: React.ReactNode }) {
  return (
    <div
      className="h-full p-[3px] min-[720px]:p-1"
      style={{ clipPath: PENNANT_CLIP, background: medalOf(rank).frame }}
    >
      <div className="relative h-full overflow-hidden" style={{ clipPath: PENNANT_CLIP }}>
        {children}
      </div>
    </div>
  );
}

/** Крупная цифра места в углу — как номер на спортивной карточке */
function Numeral({ rank, first }: { rank: number; first: boolean }) {
  return (
    <span
      aria-label={`Место ${rank}`}
      className={cn(
        "pointer-events-none select-none font-display font-bold leading-none tracking-[-0.04em] [text-shadow:0_2px_12px_rgba(0,0,0,0.45)]",
        first
          ? "text-[44px] min-[400px]:text-[50px] min-[720px]:text-[88px]"
          : "text-[34px] min-[400px]:text-[40px] min-[720px]:text-[68px]"
      )}
      style={{ color: medalOf(rank).numeral }}
    >
      {rank}
    </span>
  );
}

/** Слой с «глубиной» для 3D-наклона (см. .tilt-layer в globals.css) */
function depth(d: number) {
  return { "--depth": d } as React.CSSProperties;
}

/** Оборот карточки: место, очки, процент побед, игры и роль. Сила здесь не показывается — её видят только тренер и сам игрок */
function TopPlayerBack({ player, rank, name }: { player: TopPlayer; rank: number; name: string }) {
  const games = player.wins + player.losses;
  const winrate = games > 0 ? `${Math.round((player.wins / games) * 100)}%` : "—";
  const rows: [string, string][] = [
    ["Очки", formatPoints(player.totalPoints)],
    ["Побед", winrate],
    ["Игр", String(games)],
  ];
  return (
    <Frame rank={rank}>
      <div
        className="flex h-full flex-col px-2 pb-[18%] pt-2 text-white min-[720px]:px-5 min-[720px]:pt-5"
        style={{ background: "linear-gradient(180deg, rgba(8,18,20,0.88) 0%, rgba(8,18,20,0.98) 100%)" }}
      >
        <p
          className="text-center text-[9px] font-bold uppercase tracking-[0.1em] min-[720px]:text-[12px]"
          style={{ color: medalOf(rank).numeral }}
        >
          Место {rank}
        </p>
        <p className="mt-0.5 line-clamp-2 break-words text-center font-display text-[10px] font-bold uppercase leading-tight min-[720px]:mt-1 min-[720px]:text-[15px]">
          {name}
        </p>
        <dl className="mt-auto space-y-0.5 min-[720px]:space-y-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-1">
              <dt className="text-[9px] uppercase tracking-[0.06em] text-white/70 min-[720px]:text-[12px]">{label}</dt>
              <dd className="font-mono-num text-[12px] font-bold min-[720px]:text-[18px]">{value}</dd>
            </div>
          ))}
        </dl>
        {player.primaryRole && (
          <p className="mt-2 hidden text-center text-[12px] text-white/80 min-[720px]:block">
            {DOTA_ROLE_LABELS[player.primaryRole]}
          </p>
        )}
      </div>
    </Frame>
  );
}

function SeasonLeaderLabel() {
  return (
    <p
      className="mb-1.5 text-center text-[10px] font-bold uppercase tracking-[0.1em] min-[720px]:mb-2.5 min-[720px]:text-[12px]"
      style={{ color: "var(--gold-ink)" }}
    >
      Лидер сезона
    </p>
  );
}

export function TopPlayerCard({
  player,
  rank,
  viewer,
}: {
  player: TopPlayer | null | undefined;
  rank: 1 | 2 | 3 | number;
  viewer?: { id: string; role: string } | null;
}) {
  const first = rank === 1;
  const size = first ? SIZE.first : SIZE.other;
  const medal = medalOf(rank);

  if (!player) {
    return (
      <div>
        {first && <SeasonLeaderLabel />}
        <div className={cn("relative mx-auto", size)} style={{ filter: medal.shadow }}>
          <Frame rank={rank}>
            <div className="flex h-full flex-col bg-[var(--surface)] px-2 pb-[18%] pt-1 min-[720px]:px-4 min-[720px]:pt-2">
              <span className="opacity-50">
                <Numeral rank={rank} first={first} />
              </span>
              <p className="mt-auto text-center text-[12px] text-[var(--text-3)] min-[720px]:text-sm">Свободно</p>
            </div>
          </Frame>
        </div>
      </div>
    );
  }

  const name = shortDisplayName(player);
  const canSeePower = viewer?.role === "ADMIN" || viewer?.id === player.id;

  return (
    <div>
    {first && <SeasonLeaderLabel />}
    {/* Нажатие на карточку открывает профиль; кнопка ↻ в углу переворачивает её */}
    <div className={cn("relative mx-auto", size)} style={{ filter: medal.shadow }}>
      <TiltCard
        className="h-full"
        shape={PENNANT_CLIP}
        flipButton
        flipLabel={`Перевернуть карточку: ${name}`}
        back={
          <Link href={playerProfilePath(player.id, viewer)} className={cn("press relative block", size)}>
            <TopPlayerBack player={player} rank={rank} name={name} />
          </Link>
        }
      >
        <Link href={playerProfilePath(player.id, viewer)} className={cn("press relative block", size)}>
          <Frame rank={rank}>
            {/* Задний слой: фото чуть больше карточки, чтобы при сдвиге не показывался край */}
            <div className="tilt-layer absolute -inset-2 bg-[var(--control)]" style={depth(0.3)}>
              {player.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={player.photoUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover object-top"
                />
              ) : (
                <>
                  <div className="img-placeholder absolute inset-0" />
                  {/* Нет фото — крупные инициалы (только на ПК: на телефоне карточка маленькая и они налезали на имя) */}
                  <span
                    aria-hidden
                    className="absolute left-1/2 top-[36%] hidden h-[64px] w-[64px] -translate-x-1/2 items-center justify-center rounded-full border-2 border-white/50 bg-[rgba(8,18,20,0.55)] font-display text-[22px] font-bold leading-none text-white backdrop-blur-sm min-[720px]:flex"
                  >
                    {initials(player.firstName, player.lastName)}
                  </span>
                </>
              )}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(8,18,20,0.30) 0%, rgba(8,18,20,0.05) 35%, rgba(8,18,20,0.55) 68%, rgba(8,18,20,0.92) 100%)",
                }}
              />
            </div>

            <div className="relative z-[1] flex h-full flex-col px-2 pb-[17%] pt-1 min-[720px]:px-4 min-[720px]:pt-2">
              {/* Передний слой: цифра места (справа место под кнопку ↻) */}
              <div className="tilt-layer flex w-full items-start justify-between gap-1 pr-8 min-[720px]:pr-10" style={depth(1)}>
                <Numeral rank={rank} first={first} />
                {canSeePower && (
                  <span className="mt-2 hidden min-[720px]:mt-3 min-[720px]:inline-flex">
                    <PowerPill value={player.finalRating} />
                  </span>
                )}
              </div>

              {/* Средний слой: имя и очки */}
              <div className="tilt-layer mt-auto min-w-0 text-center" style={depth(0.65)}>
                <ViewTransition name={`player-name-${player.id}`} share="morph">
                  {/* Длинные имена не обрезаются «МАКСИ…»: шрифт меньше и перенос на 2 строки */}
                  <p
                    className={cn(
                      "line-clamp-2 break-words font-bold uppercase leading-tight text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.45)]",
                      // Длинное имя на телефоне — более узким шрифтом и строчными, чтобы «Максимилиан» влезал целиком
                      name.length > 9
                        ? "font-sans text-[11px] tracking-[-0.01em] normal-case min-[400px]:text-[12px] min-[720px]:tracking-normal min-[720px]:font-display min-[720px]:text-[15px] min-[720px]:uppercase"
                        : "font-display text-[11px] min-[400px]:text-[12px] min-[720px]:text-[16px]"
                    )}
                  >
                    {name}
                  </p>
                </ViewTransition>
                <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-[var(--points-border)] bg-[var(--points-bg)] px-2 py-0.5 text-[var(--points-ink)] min-[720px]:mt-3 min-[720px]:h-7 min-[720px]:px-2.5">
                  <span
                    className="inline-block h-[6px] w-[6px] shrink-0 bg-[var(--points)] min-[720px]:h-[7px] min-[720px]:w-[7px]"
                    style={{ transform: "rotate(45deg)" }}
                    aria-hidden
                  />
                  <CountUp
                    value={player.totalPoints}
                    className="font-mono-num text-[11px] font-semibold min-[720px]:text-[13px]"
                  />
                  <span className="hidden text-[11px] font-medium min-[720px]:inline">очк.</span>
                </span>
              </div>
            </div>
          </Frame>
        </Link>
      </TiltCard>
    </div>
    </div>
  );
}
