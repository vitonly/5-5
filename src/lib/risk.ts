/**
 * «Ученики в зоне риска» для дашборда тренера.
 *
 * Ученик попадает в список, если выполняется хотя бы одно:
 *   1. за последние 30 дней просрочено 2+ домашки;
 *   2. за 14 дней домашки выдавались, но ни одна не сдана;
 *   3. за 3 недели пропущено 2+ занятия, на которых его ждали
 *      (общие занятия и занятия его групп).
 * Всё считается функцией assessRisk без базы данных — её легко проверить тестом.
 */

const DAY = 24 * 60 * 60 * 1000;

/** 2 просрочки, 5 просрочек — правильное окончание после числа */
function overdueWord(n: number) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "просрочки";
  return m10 === 1 && m100 !== 11 ? "просрочка" : "просрочек";
}

export type RiskInput = {
  /** createdAt — когда ученик появился в школе: более ранние занятия ему не в счёт */
  students: { id: string; name: string; groupIds: string[]; createdAt?: Date }[];
  /** Домашки, выданные за последние 30 дней */
  assignments: { studentId: string; status: string; createdAt: Date }[];
  /** Сдачи домашек за последние 14 дней */
  submissions: { studentId: string; submittedAt: Date }[];
  /** Занятия за последние 3 недели: чьи (группа или все) и кто пришёл */
  lessons: { date: Date; groupId: string | null; presentIds: string[] }[];
  now?: Date;
};

export type RiskStudent = { id: string; name: string; reasons: string[] };

export function assessRisk(input: RiskInput): RiskStudent[] {
  const now = (input.now ?? new Date()).getTime();
  const result: RiskStudent[] = [];

  for (const s of input.students) {
    const reasons: string[] = [];

    // 1. Просрочки за 30 дней
    const overdue = input.assignments.filter(
      (a) => a.studentId === s.id && a.status === "OVERDUE" && now - a.createdAt.getTime() <= 30 * DAY
    ).length;
    if (overdue >= 2) reasons.push(`${overdue} ${overdueWord(overdue)} за месяц`);

    // 2. Домашки выдавались, а сдач нет
    const givenRecently = input.assignments.some(
      (a) => a.studentId === s.id && now - a.createdAt.getTime() <= 14 * DAY
    );
    const submittedRecently = input.submissions.some(
      (x) => x.studentId === s.id && now - x.submittedAt.getTime() <= 14 * DAY
    );
    if (givenRecently && !submittedRecently) reasons.push("2 недели не сдаёт домашки");

    // 3. Пропуски занятий, на которых его ждали
    const expected = input.lessons.filter(
      (l) =>
        now - l.date.getTime() <= 21 * DAY &&
        l.date.getTime() <= now &&
        (!s.createdAt || l.date.getTime() >= s.createdAt.getTime()) &&
        (l.groupId === null || s.groupIds.includes(l.groupId))
    );
    const missed = expected.filter((l) => !l.presentIds.includes(s.id)).length;
    if (missed >= 2) reasons.push(`пропущено ${missed} из ${expected.length} занятий`);

    if (reasons.length) result.push({ id: s.id, name: s.name, reasons });
  }

  // Сначала те, у кого больше причин
  return result.sort((a, b) => b.reasons.length - a.reasons.length || a.name.localeCompare(b.name, "ru"));
}
