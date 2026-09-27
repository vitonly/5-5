"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlayerLink } from "@/components/PlayerLink";
import {
  computeBaseRating,
  getRankBaseTable,
  type VibeValue,
} from "@/lib/rating";
import { rankLabel, MEDAL_BASE_RATING, RANK_MEDALS, VIBE_LABELS } from "@/lib/labels";
import { PowerPill } from "@/components/StatPills";

interface ReceivedRating {
  rater: {
    id: string;
    firstName: string;
    lastName?: string | null;
    username?: string | null;
  };
  score?: number;
  mechanics?: number;
  macro?: number;
}

interface ReceivedVibe {
  voter: {
    id: string;
    firstName: string;
    lastName?: string | null;
    username?: string | null;
  };
  value: VibeValue;
}

export function RatingBreakdown({
  profile,
  received,
  vibes = [],
  viewer,
  seasonLabel,
  givenSkill = 0,
  givenVibe = 0,
  expectedVotes = 0,
}: {
  profile: {
    mmr?: number | null;
    rankTier?: number | null;
    seasonCoefficient?: number;
    skillMod?: number;
    vibeMod?: number;
    finalRating: number;
  };
  received: ReceivedRating[];
  vibes?: ReceivedVibe[];
  viewer?: { id: string; role: string } | null;
  seasonLabel?: string | null;
  givenSkill?: number;
  givenVibe?: number;
  expectedVotes?: number;
}) {
  const [open, setOpen] = useState(false);
  const rankBase = computeBaseRating(profile);
  const skillMod = profile.skillMod ?? 0;
  const vibeMod = Math.round(profile.vibeMod ?? 0);
  const table = getRankBaseTable();

  const rankBar = Math.min(100, (rankBase / 50) * 100);
  const skillBar = Math.min(100, (skillMod / 30) * 100);
  const vibeBar = Math.min(100, ((vibeMod + 5) / 10) * 100);

  return (
    <Card>
      <CardHeader className="p-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left transition-colors hover:bg-[var(--control)]"
        >
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="text-base">Рейтинг силы</CardTitle>
            <PowerPill value={profile.finalRating} />
          </div>
          <span
            className={`text-[var(--text-4)] transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          >
            ▼
          </span>
        </button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4 border-t border-[var(--border-soft)] pt-4 text-sm">
          <p className="text-[13px] text-[var(--text-3)]">
            Виден только тебе и тренеру. Итог = РангБаза (1–50) + SkillMod (0…+30) + TiltMod (−5…+5).
            {seasonLabel && (
              <>
                {" "}
                Сезон оценок: <b className="text-[var(--text-2)]">{seasonLabel}</b>.
              </>
            )}
          </p>

          {expectedVotes > 0 && (
            <div className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--control)] px-3 py-2 text-sm text-[var(--text-2)]">
              <p>
                <b className="text-[var(--text)]">Сам оценил других:</b> скилл {givenSkill}/
                {expectedVotes}, вайб {givenVibe}/{expectedVotes}
                {Math.min(givenSkill, givenVibe) < expectedVotes && (
                  <span className="ml-2 text-[var(--danger)]">голосование не завершено</span>
                )}
              </p>
              <p className="mt-1 text-xs text-[var(--text-4)]">
                Это не то же самое, что список ниже: ниже — кто оценил <b>этого</b> игрока.
              </p>
            </div>
          )}

          <div className="space-y-3 rounded-[var(--radius-control)] border border-[var(--power-border)] bg-[var(--power-bg)] p-4">
            <Bar label="Ранг доты" value={rankBase} bar={rankBar} />
            <Bar label="Скилл" value={`+${skillMod}`} bar={skillBar} />
            <Bar
              label="Стабильность"
              value={vibeMod > 0 ? `+${vibeMod}` : String(vibeMod)}
              bar={vibeBar}
            />
            <p className="text-xs text-[var(--text-4)]">
              Не подвержен тильту даёт плюс (до +5), подвержен — минус (до −5).
            </p>
            <p className="pt-1 font-display text-lg font-bold text-[var(--power)]">
              Итог: {profile.finalRating}
            </p>
          </div>

          <div>
            <p className="mb-2 font-semibold">База по рангу</p>
            <div className="grid grid-cols-2 gap-1 text-xs sm:grid-cols-4">
              {Object.entries(RANK_MEDALS).map(([medal, name]) => (
                <span key={medal} className="text-[var(--text-3)]">
                  {name}:{" "}
                  <b className="font-mono-num text-[var(--power)]">
                    {Number(medal) === 8
                      ? "75"
                      : (table[Number(medal)] ?? [MEDAL_BASE_RATING[Number(medal)]]).join("–")}
                  </b>
                </span>
              ))}
            </div>
            <p className="mt-2 text-[var(--text-2)]">
              Ваш ранг: <span className="text-[var(--power)]">{rankLabel(profile.rankTier)}</span> →{" "}
              <b className="font-mono-num">{rankBase}</b>
            </p>
          </div>

          <div>
            <p className="mb-2 font-semibold">Оценки скилла (кто оценил вас)</p>
            {received.length === 0 ? (
              <p className="text-[var(--text-3)]">Пока нет оценок.</p>
            ) : (
              <div className="space-y-2">
                {received.map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-[var(--radius-control)] bg-[var(--control)] px-3 py-2"
                  >
                    <PlayerLink user={r.rater} viewer={viewer} />
                    <span className="font-mono-num text-xs text-[var(--text-3)]">
                      {typeof r.score === "number"
                        ? `оценка ${r.score}/100`
                        : `мех ${r.mechanics ?? "—"} · макро ${r.macro ?? "—"}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 font-semibold">Вайб (кто оценил вас)</p>
            {vibes.length === 0 ? (
              <p className="text-[var(--text-3)]">Пока нет голосов.</p>
            ) : (
              <div className="space-y-2">
                {vibes.map((v, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-[var(--radius-control)] bg-[var(--control)] px-3 py-2"
                  >
                    <PlayerLink user={v.voter} viewer={viewer} />
                    <span className="text-xs text-[var(--text-2)]">
                      {VIBE_LABELS[v.value as keyof typeof VIBE_LABELS] ?? v.value}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function Bar({ label, value, bar }: { label: string; value: string | number; bar: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[12px]">
        <span className="font-mono-num uppercase tracking-wider text-[var(--text-3)]">{label}</span>
        <span className="font-mono-num font-bold text-[var(--power)]">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/70">
        <div
          className="h-full rounded-full bg-[var(--power)]"
          style={{ width: `${Math.max(0, Math.min(100, bar))}%` }}
        />
      </div>
    </div>
  );
}
