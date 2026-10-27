/**
 * Разбор замороженной силы игроков сессии 5на5 (поле MatchSession.powerSnapshot).
 * Отдельный файл без базы данных — им пользуются и страницы в браузере.
 * Зачем нужна заморозка — см. lib/match-power.ts
 */

export type PowerMap = Record<string, number>;

/** Разобрать снимок силы из поля сессии (JSON { userId: сила }) */
export function parsePowerSnapshot(raw: string | null | undefined): PowerMap {
  try {
    const data = JSON.parse(raw || "{}");
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    const map: PowerMap = {};
    for (const [id, v] of Object.entries(data)) {
      if (typeof v === "number" && Number.isFinite(v)) map[id] = v;
    }
    return map;
  } catch {
    return {};
  }
}

/** Сила с учётом заморозки: из снимка сессии, а кого в нём нет — текущая из профиля */
export function withSnapshot(current: PowerMap, snapshotRaw: string | null | undefined): PowerMap {
  return { ...current, ...parsePowerSnapshot(snapshotRaw) };
}
