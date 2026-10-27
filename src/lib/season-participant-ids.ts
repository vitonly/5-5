/**
 * Разбор списка участников сезонного голосования (поле RatingSeason.participantIds, JSON).
 * Отдельный файл без базы данных — его можно использовать и на странице в браузере.
 */

/** Список id учеников-участников. Пустой массив — участвуют все ученики */
export function parseParticipantIds(raw: string | null | undefined): string[] {
  try {
    const ids = JSON.parse(raw || "[]");
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}
