/**
 * Система рейтинга игрока (1–100) по rating_system_spec.md
 * Итог = clamp( РангБаза + SkillMod + VibeMod , 1, 100 )
 */

/** База по медали OpenDota (1–8) и звезде (1–5). Титан — всегда 75.
 * Каждая медаль строго после предыдущей (без пересечений). */
const RANK_BASE_TABLE: Record<number, number[]> = {
  1: [5, 6, 7, 8, 9], // Рекрут
  2: [10, 11, 13, 14, 16], // Страж
  3: [17, 19, 21, 23, 25], // Рыцарь
  4: [26, 27, 28, 29, 30], // Герой
  5: [31, 33, 36, 38, 41], // Легенда
  6: [42, 45, 48, 51, 54], // Властелин
  7: [55, 58, 62, 65, 69], // Божество
  8: [75], // Титан
};

export function clampRating(value: number): number {
  return Math.max(1, Math.min(100, Math.round(value)));
}

/** РангБаза 5–75 из OpenDota rank_tier */
export function rankTierToBase(rankTier?: number | null): number {
  if (!rankTier) return RANK_BASE_TABLE[1][0];
  const medal = Math.floor(rankTier / 10);
  if (medal === 8) return 75;
  let stars = rankTier % 10;
  if (stars <= 0) stars = 1;
  if (stars > 5) stars = 5;
  const row = RANK_BASE_TABLE[medal] ?? RANK_BASE_TABLE[1];
  return row[stars - 1] ?? row[0];
}

export function computeBaseRating(profile: {
  rankTier?: number | null;
  mmr?: number | null;
}): number {
  return rankTierToBase(profile.rankTier);
}

/** SkillMod 0…+20 из средних механики и макро */
export function calculateSkillMod(mechanicsScores: number[], macroScores: number[]): number {
  if (mechanicsScores.length === 0 && macroScores.length === 0) return 0;
  const mechAvg =
    mechanicsScores.length > 0
      ? mechanicsScores.reduce((a, b) => a + b, 0) / mechanicsScores.length
      : 0;
  const macroAvg =
    macroScores.length > 0 ? macroScores.reduce((a, b) => a + b, 0) / macroScores.length : 0;
  if (mechanicsScores.length === 0) {
    return Math.round(((macroAvg - 1) / 9) * 20);
  }
  if (macroScores.length === 0) {
    return Math.round(((mechAvg - 1) / 9) * 20);
  }
  const skillAvg = (mechAvg + macroAvg) / 2;
  return Math.round(((skillAvg - 1) / 9) * 20);
}

export type VibeValue = "LIKE" | "NEUTRAL" | "DISLIKE";

/**
 * VibeMod −5…+5.
 * Перевес «нравится» ОТНИМАЕТ очки (намеренно — для баланса команд).
 */
export function calculateVibeMod(votes: VibeValue[]): number {
  if (votes.length === 0) return 0;
  const like = votes.filter((v) => v === "LIKE").length;
  const dislike = votes.filter((v) => v === "DISLIKE").length;
  const total = votes.length;
  const raw = -((like - dislike) / total) * 5;
  return Math.round(raw * 10) / 10;
}

export function calculateFinalRating(rankBase: number, skillMod: number, vibeMod: number): number {
  return clampRating(rankBase + skillMod + vibeMod);
}

export function computeStrengthFromVotes(options: {
  rankTier?: number | null;
  mechanicsScores: number[];
  macroScores: number[];
  vibeVotes: VibeValue[];
}) {
  const rankBase = rankTierToBase(options.rankTier);
  const skillMod = calculateSkillMod(options.mechanicsScores, options.macroScores);
  const vibeMod = calculateVibeMod(options.vibeVotes);
  return {
    rankBase,
    skillMod,
    vibeMod,
    finalRating: calculateFinalRating(rankBase, skillMod, vibeMod),
  };
}

/** Совместимость: пересчёт при смене ранга с уже сохранёнными модами */
export function recalculateFinalRating(
  profile: { rankTier?: number | null; mmr?: number | null },
  skillModOrLegacyCoef: number = 0,
  vibeMod: number = 0
) {
  const rankBase = computeBaseRating(profile);
  // Старый API передавал seasonCoefficient (~1.0). Если похоже на коэффициент — игнорим.
  const skillMod =
    skillModOrLegacyCoef > 0 && skillModOrLegacyCoef <= 3 && !Number.isInteger(skillModOrLegacyCoef)
      ? 0
      : Math.round(skillModOrLegacyCoef);
  const vibe = typeof vibeMod === "number" ? vibeMod : 0;
  return {
    baseRating: rankBase,
    rankBase,
    skillMod,
    vibeMod: vibe,
    seasonCoefficient: 1,
    finalRating: calculateFinalRating(rankBase, skillMod, vibe),
  };
}

/** Экспорт таблицы для UI */
export function getRankBaseTable(): Record<number, number[]> {
  return RANK_BASE_TABLE;
}
