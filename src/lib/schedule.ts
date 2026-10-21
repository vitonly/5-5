/**
 * Расписание групп: дни недели, время и «ближайшее занятие».
 * Всё время — московское (UTC+3, без перехода на летнее время), как и остальные даты на сайте.
 */

export type ScheduleSlot = { weekday: number; time: string };

/** 1 — понедельник … 7 — воскресенье */
export const WEEKDAYS = ["", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
export const WEEKDAYS_SHORT = ["", "пн", "вт", "ср", "чт", "пт", "сб", "вс"];
/** Для фраз «в среду», «во вторник» */
const WEEKDAYS_ON = ["", "в понедельник", "во вторник", "в среду", "в четверг", "в пятницу", "в субботу", "в воскресенье"];

const MSK_OFFSET = 3 * 60 * 60 * 1000;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Проверить и почистить слоты, присланные со страницы (неправильные отбрасываем) */
export function cleanSlots(raw: unknown): ScheduleSlot[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ScheduleSlot[] = [];
  for (const s of raw.slice(0, 14)) {
    const weekday = Number((s as ScheduleSlot)?.weekday);
    const time = String((s as ScheduleSlot)?.time ?? "").trim();
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7 || !TIME_RE.test(time)) continue;
    const key = `${weekday} ${time}`;
    if (seen.has(key)) continue;   // одинаковые слоты не дублируем
    seen.add(key);
    out.push({ weekday, time });
  }
  return sortSlots(out);
}

export function sortSlots<T extends ScheduleSlot>(slots: T[]): T[] {
  return [...slots].sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time));
}

/** «вт, чт 18:00» — коротко для списка групп */
export function slotsLabel(slots: ScheduleSlot[]): string {
  return sortSlots(slots)
    .map((s) => `${WEEKDAYS_SHORT[s.weekday]} ${s.time}`)
    .join(", ");
}

/** Сегодняшний день недели по Москве: 1 — пн … 7 — вс */
export function moscowWeekday(now = new Date()): number {
  const d = new Date(now.getTime() + MSK_OFFSET).getUTCDay(); // 0 — вс
  return d === 0 ? 7 : d;
}

/** Сегодняшняя дата по Москве в виде «2026-10-21» (для полей type="date") */
export function moscowDateKey(now = new Date()): string {
  return new Date(now.getTime() + MSK_OFFSET).toISOString().slice(0, 10);
}

/**
 * Когда ближайшее занятие из списка слотов.
 * Возвращает момент начала (настоящее время) — или null, если расписания нет.
 * Занятие, которое началось меньше 2 часов назад, ещё считается «текущим».
 */
export function nextOccurrence(slots: ScheduleSlot[], now = new Date()): Date | null {
  let best: Date | null = null;
  const msk = new Date(now.getTime() + MSK_OFFSET);
  const today = moscowWeekday(now);
  for (const s of slots) {
    const [h, m] = s.time.split(":").map(Number);
    for (const extraWeek of [0, 7]) {
      const days = ((s.weekday - today + 7) % 7) + extraWeek;
      // Полночь сегодняшнего московского дня + дни + время → обратно в настоящее время
      const start = Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate() + days, h, m) - MSK_OFFSET;
      if (start > now.getTime() - 2 * 60 * 60 * 1000) {
        if (!best || start < best.getTime()) best = new Date(start);
        break;
      }
    }
  }
  return best;
}

/** «сегодня в 18:00», «завтра в 18:00», «в четверг, 23.10, в 18:00» */
export function occurrenceLabel(at: Date, now = new Date()): string {
  const key = (d: Date) => moscowDateKey(d);
  const msk = new Date(at.getTime() + MSK_OFFSET);
  const time = `${String(msk.getUTCHours()).padStart(2, "0")}:${String(msk.getUTCMinutes()).padStart(2, "0")}`;
  if (key(at) === key(now)) return `сегодня в ${time}`;
  if (key(at) === key(new Date(now.getTime() + 24 * 60 * 60 * 1000))) return `завтра в ${time}`;
  const date = `${String(msk.getUTCDate()).padStart(2, "0")}.${String(msk.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${WEEKDAYS_ON[moscowWeekday(at)]}, ${date}, в ${time}`;
}
