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
  6: "Древний",
  7: "Божественный",
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

export function rankLabel(rankTier?: number | null): string {
  if (!rankTier) return "Нет данных";
  const medal = Math.floor(rankTier / 10);
  const stars = rankTier % 10;
  const name = RANK_MEDALS[medal] || "Неизвестно";
  return stars > 0 ? `${name} ${stars}` : name;
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
