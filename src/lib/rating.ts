/**
 * Сила игрока (целое 1–100):
 * finalRating = clamp(rankBase + skillMod + tiltMod, 1, 100)
 *
 * rankBase 1…50 по медали
 * skillMod 0…+30 из оценок 0–100 (тренер 50% + ученики 50%)
 * tiltMod −5…+5 из голосов тильта
 */

/** База по медали OpenDota (1–8). Титан = 50. */
const RANK_BASE_TABLE: Record<number, number[]> = {
  1: [1, 2, 3, 4, 5], // Рекрут
  2: [6, 7, 8, 9, 11], // Страж
  3: [12, 14, 16, 18, 20], // Рыцарь
  4: [21, 22, 24, 26, 27], // Герой
  5: [28, 30, 32, 34, 36], // Легенда
  6: [37, 39, 41, 43, 45], // Властелин
  7: [46, 47, 48, 49, 49], // Божество (★5 = 49)
  8: [50], // Титан
};

export function clampRating(value: number): number {
  return Math.max(1, Math.min(100, Math.round(value)));
}

export function rankTierToBase(rankTier?: number | null): number {
  if (!rankTier) return RANK_BASE_TABLE[1][0];
  const medal = Math.floor(rankTier / 10);
  if (medal === 8) return 50;
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

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/** Медиана с отсечением min/max при ≥3 оценках. */
export function trimmedMedian(scores: number[]): number | null {
  if (!scores.length) return null;
  let list = [...scores];
  if (list.length >= 3) {
    list.sort((a, b) => a - b);
    list = list.slice(1, -1);
  }
  return median(list);
}

/**
 * SkillMod 0…+30.
 * combined = 50/50 trainer + peerMedian; skillMod = round(combined/100*30)
 */
export function calculateSkillModFromScores(opts: {
  trainerScore?: number | null;
  peerScores: number[];
}): number {
  const peerMed = trimmedMedian(opts.peerScores);
  const trainer =
    typeof opts.trainerScore === "number" && Number.isFinite(opts.trainerScore)
      ? Math.max(0, Math.min(100, opts.trainerScore))
      : null;

  let combined: number;
  if (trainer != null && peerMed != null) {
    combined = (trainer + peerMed) / 2;
  } else if (trainer != null) {
    combined = trainer;
  } else if (peerMed != null) {
    combined = peerMed;
  } else {
    return 0;
  }

  return Math.max(0, Math.min(30, Math.round((combined / 100) * 30)));
}

export type TiltValue = "STABLE" | "UNSURE" | "TILT";
/** @deprecated use TiltValue */
export type VibeValue = TiltValue;

/**
 * Единица тильта для силы (как старый vibe — для баланса команд):
 * «Не подвержен» → минус к силе; «Подвержен» → плюс.
 */
export function tiltToUnit(v: string): number {
  if (v === "STABLE" || v === "LIKE") return -1;
  if (v === "TILT" || v === "DISLIKE") return 1;
  return 0; // UNSURE / NEUTRAL
}

/**
 * TiltMod −5…+5 (целое).
 * trainer и среднее peers ∈ [−1,1], 50/50, ×5.
 * STABLE → до −5, TILT → до +5.
 */
export function calculateTiltMod(opts: {
  trainerTilt?: TiltValue | null;
  peerTilts: TiltValue[];
}): number {
  const peerUnits = opts.peerTilts.map(tiltToUnit);
  const peerAvg =
    peerUnits.length > 0
      ? peerUnits.reduce((a, b) => a + b, 0) / peerUnits.length
      : null;
  const trainerUnit =
    opts.trainerTilt != null ? tiltToUnit(opts.trainerTilt) : null;

  let combined: number;
  if (trainerUnit != null && peerAvg != null) {
    combined = (trainerUnit + peerAvg) / 2;
  } else if (trainerUnit != null) {
    combined = trainerUnit;
  } else if (peerAvg != null) {
    combined = peerAvg;
  } else {
    return 0;
  }

  return Math.max(-5, Math.min(5, Math.round(combined * 5)));
}

/** @deprecated имя vibe — фактически tiltMod */
export function calculateVibeMod(votes: TiltValue[]): number {
  return calculateTiltMod({ peerTilts: votes });
}

export function calculateFinalRating(
  rankBase: number,
  skillMod: number,
  tiltMod: number
): number {
  return clampRating(rankBase + skillMod + tiltMod);
}

export function computeStrengthFromVotes(options: {
  rankTier?: number | null;
  trainerScore?: number | null;
  peerScores: number[];
  trainerTilt?: TiltValue | null;
  peerTilts: TiltValue[];
  /** legacy */
  mechanicsScores?: number[];
  macroScores?: number[];
  vibeVotes?: TiltValue[];
}) {
  const rankBase = rankTierToBase(options.rankTier);
  const peerScores =
    options.peerScores.length > 0
      ? options.peerScores
      : // legacy fallback: map 1–10 mech/macro → ~0–100
        (() => {
          const mech = options.mechanicsScores ?? [];
          const mac = options.macroScores ?? [];
          if (!mech.length && !mac.length) return [] as number[];
          const n = Math.max(mech.length, mac.length);
          const out: number[] = [];
          for (let i = 0; i < n; i++) {
            const a = mech[i] ?? mac[i] ?? 5;
            const b = mac[i] ?? mech[i] ?? 5;
            out.push(Math.round((((a + b) / 2 - 1) / 9) * 100));
          }
          return out;
        })();

  const peerTilts =
    options.peerTilts.length > 0
      ? options.peerTilts
      : (options.vibeVotes ?? []);

  const skillMod = calculateSkillModFromScores({
    trainerScore: options.trainerScore,
    peerScores,
  });
  const tiltMod = calculateTiltMod({
    trainerTilt: options.trainerTilt,
    peerTilts,
  });

  return {
    rankBase,
    skillMod,
    vibeMod: tiltMod,
    tiltMod,
    finalRating: calculateFinalRating(rankBase, skillMod, tiltMod),
  };
}

export function recalculateFinalRating(
  profile: { rankTier?: number | null; mmr?: number | null },
  skillModOrLegacyCoef: number = 0,
  vibeMod: number = 0
) {
  const rankBase = computeBaseRating(profile);
  const skillMod =
    skillModOrLegacyCoef > 0 &&
    skillModOrLegacyCoef <= 3 &&
    !Number.isInteger(skillModOrLegacyCoef)
      ? 0
      : Math.round(skillModOrLegacyCoef);
  const vibe = Math.round(typeof vibeMod === "number" ? vibeMod : 0);
  return {
    baseRating: rankBase,
    rankBase,
    skillMod,
    vibeMod: vibe,
    seasonCoefficient: 1,
    finalRating: calculateFinalRating(rankBase, skillMod, vibe),
  };
}

export function getRankBaseTable(): Record<number, number[]> {
  return RANK_BASE_TABLE;
}

/** Сброс всех peer/tilt голосов и модов силы → только база ранга. */
export async function resetAllPowerToRankBase(
  run: (fn: () => Promise<unknown>) => Promise<unknown>
) {
  // implemented in seasons.ts with prisma
  void run;
}
