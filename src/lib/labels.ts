import { DotaRole, SeasonName, MaterialType, SkillLevel } from "@prisma/client";

export const DOTA_ROLE_LABELS: Record<DotaRole, string> = {
  CARRY: "Керри (1)",
  MID: "Мид (2)",
  OFFLANE: "Оффлейн (3)",
  SUPPORT: "Саппорт (4)",
  HARD_SUPPORT: "Хард-саппорт (5)",
};

export const DOTA_ROLE_SHORT: Record<DotaRole, string> = {
  CARRY: "КР",
  MID: "МД",
  OFFLANE: "ОФ",
  SUPPORT: "СП",
  HARD_SUPPORT: "ХС",
};

export const DOTA_ROLE_POSITION: Record<DotaRole, number> = {
  CARRY: 1,
  MID: 2,
  OFFLANE: 3,
  SUPPORT: 4,
  HARD_SUPPORT: 5,
};

/** Подписи позиций в 5v5 */
export const POSITION_LABELS: Record<number, string> = {
  1: "1 · Carry",
  2: "2 · Mid",
  3: "3 · Off",
  4: "4 · Soft",
  5: "5 · Hard",
};

export const SEASON_LABELS: Record<SeasonName, string> = {
  AUTUMN: "Осенний",
  WINTER: "Зимний",
  SPRING: "Весенний",
};

export const MATERIAL_TYPE_LABELS: Record<MaterialType, string> = {
  VIDEO: "Видео",
  STREAM: "Трансляции",
  ARTICLE: "Статьи",
};

export const SKILL_LEVEL_LABELS: Record<SkillLevel, string> = {
  BEGINNER: "Новички",
  INTERMEDIATE: "Средний уровень",
  ADVANCED: "Высокий уровень",
};

export const RATING_CRITERIA = {
  mechanics: "Механика",
  macro: "Макро",
} as const;

export const RATING_CRITERIA_HINTS = {
  mechanics: "Контроль героя, ластхит, скиллшоты, комбо",
  macro: "Карта, тайминги, фарм, ротации, объекты",
} as const;

export const VIBE_LABELS = {
  LIKE: "Нравится",
  NEUTRAL: "Нейтрально",
  DISLIKE: "Не нравится",
} as const;

// OpenDota rank medals
export const RANK_MEDALS: Record<number, string> = {
  1: "Рекрут",
  2: "Страж",
  3: "Рыцарь",
  4: "Герой",
  5: "Легенда",
  6: "Властелин",
  7: "Божество",
  8: "Титан",
};

/** Ориентир базы ★1 (полная таблица со звёздами — в rating.ts) */
export const MEDAL_BASE_RATING: Record<number, number> = {
  1: 5,
  2: 10,
  3: 17,
  4: 22,
  5: 26,
  6: 37,
  7: 50,
  8: 75,
};

export function decodeRankTier(rankTier?: number | null): {
  medal: number;
  stars: number;
} | null {
  if (!rankTier) return null;
  const medal = Math.floor(rankTier / 10);
  const stars = rankTier % 10;
  if (!RANK_MEDALS[medal]) return null;
  return { medal, stars: medal === 8 ? 0 : Math.min(5, Math.max(0, stars)) };
}

/** OpenDota-формат: medal*10+stars (Титан = 80) */
export function encodeRankTier(medal: number, stars: number): number {
  if (medal === 8) return 80;
  const s = Math.min(5, Math.max(1, stars || 1));
  return medal * 10 + s;
}

export function rankLabel(rankTier?: number | null): string {
  const decoded = decodeRankTier(rankTier);
  if (!decoded) return "Нет данных";
  const name = RANK_MEDALS[decoded.medal] || "Неизвестно";
  if (decoded.medal === 8 || decoded.stars <= 0) return name;
  return `${name} ${"★".repeat(decoded.stars)}`;
}

export const HOMEWORK_STATUS_LABELS = {
  ASSIGNED: "Назначено",
  SUBMITTED: "Сдано",
  GRADED: "Проверено",
  OVERDUE: "Просрочено",
  REVISION: "На доработке",
} as const;

export const MATCH_STATUS_LABELS = {
  PLANNED: "Запланировано",
  TEAMS_SET: "Команды сформированы",
  COMPLETED: "Завершено",
} as const;
