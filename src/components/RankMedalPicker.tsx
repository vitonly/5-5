"use client";

import { RANK_MEDALS, encodeRankTier, decodeRankTier } from "@/lib/labels";
import { getRankBaseTable } from "@/lib/rating";

/** Превью базы силы для подписи под пикером */
function baseFor(medal: number, stars: number): number {
  const table = getRankBaseTable();
  if (medal === 8) return 75;
  const row = table[medal] ?? table[1];
  const s = Math.min(5, Math.max(1, stars || 1));
  return row[s - 1] ?? row[0];
}

export function RankMedalPicker({
  rankTier,
  onChange,
}: {
  rankTier: number | null;
  onChange: (rankTier: number | null) => void;
}) {
  const decoded = decodeRankTier(rankTier);
  const medal = decoded?.medal ?? 0;
  const stars = decoded?.stars || (medal === 8 ? 0 : 1);

  function selectMedal(m: number) {
    if (m === 8) {
      onChange(encodeRankTier(8, 0));
      return;
    }
    onChange(encodeRankTier(m, stars >= 1 ? stars : 1));
  }

  function selectStars(s: number) {
    if (!medal || medal === 8) return;
    onChange(encodeRankTier(medal, s));
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Object.entries(RANK_MEDALS).map(([key, label]) => {
          const m = Number(key);
          const active = medal === m;
          return (
            <button
              key={key}
              type="button"
              onClick={() => selectMedal(m)}
              className={`rounded-[var(--radius-control)] border px-2 py-2.5 text-left text-sm transition-colors ${
                active
                  ? "border-[var(--points)] bg-[var(--points-bg)] text-[var(--points)]"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--points-border)]"
              }`}
            >
              <span className="block font-display text-[13px] font-bold uppercase tracking-wide">
                {label}
              </span>
              <span className="mt-0.5 block font-mono-num text-[10px] text-[var(--text-4)]">
                база {baseFor(m, m === 8 ? 0 : stars || 1)}
              </span>
            </button>
          );
        })}
      </div>

      {medal > 0 && medal < 8 && (
        <div>
          <p className="mb-1.5 text-xs text-[var(--text-3)]">Звёзды</p>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((s) => {
              const active = stars === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => selectStars(s)}
                  className={`flex h-10 w-10 items-center justify-center rounded-[var(--radius-control)] border text-lg transition-colors ${
                    active
                      ? "border-[var(--points)] bg-[var(--points-bg)] text-[var(--points)]"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-3)] hover:border-[var(--points-border)]"
                  }`}
                  aria-label={`${s} звёзд`}
                >
                  {"★".repeat(s).slice(0, 1)}
                  <span className="ml-0.5 font-mono-num text-xs">{s}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {medal > 0 && (
        <p className="text-xs text-[var(--text-3)]">
          Выбрано:{" "}
          <span className="font-medium text-[var(--points)]">
            {RANK_MEDALS[medal]}
            {medal < 8 && stars > 0 ? ` ${"★".repeat(stars)}` : ""}
          </span>
          {" · "}
          RangBase {baseFor(medal, stars)} → сила пересчитается при сохранении
        </p>
      )}

      {medal === 0 && (
        <p className="text-xs text-[var(--text-3)]">Выберите медаль — от неё считается рейтинг силы.</p>
      )}
    </div>
  );
}
