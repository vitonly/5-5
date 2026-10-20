/**
 * Кому отправлять рассылку.
 *
 * На странице тренер выбирает «Все», группу или отдельных учеников —
 * страница сама превращает выбор в список id учеников и присылает его как `userIds`.
 * Если `userIds` нет — значит «всем» (так работали кнопки до появления групп).
 */
export function recipientFilter(body: unknown): Set<string> | null {
  const ids = (body as { userIds?: unknown } | null)?.userIds;
  if (!Array.isArray(ids)) return null;
  return new Set(ids.filter((id): id is string => typeof id === "string"));
}

/** Оставить из списка только выбранных (null — оставить всех) */
export function onlySelected<T extends { id: string }>(items: T[], filter: Set<string> | null): T[] {
  return filter ? items.filter((it) => filter.has(it.id)) : items;
}
