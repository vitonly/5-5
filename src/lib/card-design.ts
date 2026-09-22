export type CardTier = "legend" | "special" | "elite" | "gold" | "silver" | "bronze";
export type CardPattern = "cosmos" | "wire" | "neon" | "gold" | "silver" | "bronze";

export type CardDesign = {
  id: string;
  tier: CardTier;
  tierLabel: string;
  pattern: CardPattern;
  borderGradient: [string, string, string];
  bgGradient: [string, string, string];
  accent: string;
  accentAlt: string;
  text: string;
  glow: string;
  shine: string;
  patternOpacity: number;
  hueShift: number;
};

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function slug(seed: string): string {
  return hashSeed(seed).toString(36);
}

function tierFromRating(rating: number): CardTier {
  if (rating >= 55) return "legend";
  if (rating >= 45) return "special";
  if (rating >= 35) return "elite";
  if (rating >= 28) return "gold";
  if (rating >= 20) return "silver";
  return "bronze";
}

const TIER_META: Record<
  CardTier,
  {
    label: string;
    pattern: CardPattern;
    border: [string, string, string];
    bg: [string, string, string];
    accent: string;
    accentAlt: string;
    text: string;
    glow: string;
    shine: string;
  }
> = {
  legend: {
    label: "Легенда",
    pattern: "gold",
    border: ["#fff7c2", "#ffd54f", "#b8860b"],
    bg: ["#3d2e00", "#1a1400", "#0a0800"],
    accent: "#ffe566",
    accentAlt: "#ffb300",
    text: "#fffef5",
    glow: "rgba(255, 200, 50, 0.55)",
    shine: "rgba(255, 240, 150, 0.35)",
  },
  special: {
    label: "Особая",
    pattern: "cosmos",
    border: ["#f0abfc", "#e879f9", "#86198f"],
    bg: ["#4a044e", "#2e1065", "#0f0518"],
    accent: "#f0abfc",
    accentAlt: "#c084fc",
    text: "#fdf4ff",
    glow: "rgba(232, 121, 249, 0.45)",
    shine: "rgba(244, 114, 182, 0.25)",
  },
  elite: {
    label: "Элита",
    pattern: "wire",
    border: ["#e2e8f0", "#94a3b8", "#334155"],
    bg: ["#1e293b", "#0f172a", "#020617"],
    accent: "#f8fafc",
    accentAlt: "#94a3b8",
    text: "#f8fafc",
    glow: "rgba(148, 163, 184, 0.35)",
    shine: "rgba(255, 255, 255, 0.12)",
  },
  gold: {
    label: "Золото",
    pattern: "gold",
    border: ["#fde68a", "#f59e0b", "#92400e"],
    bg: ["#451a03", "#292524", "#0c0a09"],
    accent: "#fcd34d",
    accentAlt: "#f59e0b",
    text: "#fffbeb",
    glow: "rgba(245, 158, 11, 0.4)",
    shine: "rgba(252, 211, 77, 0.2)",
  },
  silver: {
    label: "Серебро",
    pattern: "silver",
    border: ["#f1f5f9", "#cbd5e1", "#64748b"],
    bg: ["#334155", "#1e293b", "#0f172a"],
    accent: "#e2e8f0",
    accentAlt: "#94a3b8",
    text: "#f8fafc",
    glow: "rgba(203, 213, 225, 0.3)",
    shine: "rgba(255, 255, 255, 0.15)",
  },
  bronze: {
    label: "Бронза",
    pattern: "neon",
    border: ["#fde047", "#06b6d4", "#0891b2"],
    bg: ["#0c0a09", "#171717", "#000000"],
    accent: "#fde047",
    accentAlt: "#22d3ee",
    text: "#fefce8",
    glow: "rgba(253, 224, 71, 0.35)",
    shine: "rgba(34, 211, 238, 0.2)",
  },
};

export function generateCardDesign(seed: string, rating: number): CardDesign {
  const h = hashSeed(seed);
  const tier = tierFromRating(rating);
  const meta = TIER_META[tier];
  const hueShift = (h % 50) - 25;

  return {
    id: slug(seed),
    tier,
    tierLabel: meta.label,
    pattern: meta.pattern,
    borderGradient: meta.border,
    bgGradient: meta.bg,
    accent: meta.accent,
    accentAlt: meta.accentAlt,
    text: meta.text,
    glow: meta.glow,
    shine: meta.shine,
    patternOpacity: 0.55 + (h % 30) / 100,
    hueShift,
  };
}

export function cardSeed(user: {
  firstName: string;
  lastName?: string | null;
  username?: string | null;
}): string {
  return [user.firstName, user.lastName, user.username].filter(Boolean).join("-");
}

/** FIFA-style shield path (viewBox 0 0 280 400) */
export const SHIELD_PATH =
  "M8 18 L108 18 L118 8 L162 8 L172 18 L272 18 L272 330 Q272 355 140 392 Q8 355 8 330 Z";

export const CARD_WIDTH = 280;
export const CARD_HEIGHT = 400;
