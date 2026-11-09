/*
 * Тренажёры модуля Б: данные и автоматическая проверка.
 * Ключи ответов посчитаны по учебному датасету «Осенний кубок СТАРТ+» (public/poligon/files/b-osenniy-kubok.xlsx).
 */
import type { ReviewCard, Workbook } from "./a-practicum";

const str = (w: Workbook, id: string) => String(w[id] ?? "").trim();
/** «46,6» → 46.6 */
const num = (s: string) => Number(String(s).replace(/\s/g, "").replace(",", ".").replace(/[^\d.-]/g, ""));

/* ---------- 1. Очистка: что не так в строке ---------- */

export const CLEAN_KINDS = [
  { v: "ok", t: "Всё правильно" },
  { v: "dup", t: "Дубль (повтор строки или объекта)" },
  { v: "space", t: "Лишние пробелы или регистр" },
  { v: "date", t: "Дата текстом / не в том виде" },
  { v: "time", t: "Счёт превратился во время" },
  { v: "dur", t: "Длительность не в минутах числом" },
  { v: "numtext", t: "Число записано текстом" },
] as const;

/** Строки из учебного датасета с ловушками и без */
export const CLEAN_ROWS: { id: string; sheet: string; cells: string[]; key: string; why: string }[] = [
  { id: "c1", sheet: "Участники", cells: ["T01", "␣Nova␣", "Казань", "01.10.2026"], key: "space", why: "Пробелы вокруг названия — СЖПРОБЕЛЫ." },
  { id: "c2", sheet: "Участники", cells: ["T02", "Iron Wolves", "Казань", "01.10.2026"], key: "ok", why: "Строка в порядке." },
  { id: "c3", sheet: "Участники", cells: ["T04", "Phoenix", "Альметьевск", "«03.10.2026» (текст)"], key: "date", why: "Дата текстом — ДАТАЗНАЧ или «Текст по столбцам»." },
  { id: "c4", sheet: "Участники", cells: ["T05", "ТИТАН", "Казань", "03.10.2026"], key: "space", why: "Регистр: ПРОПНАЧ → «Титан»." },
  { id: "c5", sheet: "Участники", cells: ["T09", "Квант", "Казань", "04.10.2026"], key: "dup", why: "«Квант» уже есть под T07 — та же команда под другим ID." },
  { id: "c6", sheet: "Матчи", cells: ["M04", "T05", "T07", "Длительность «0:36»"], key: "dur", why: "Время вместо минут: =ЧАС*60+МИНУТЫ → 36." },
  { id: "c7", sheet: "Матчи", cells: ["M05", "T01", "T04", "Длительность 47"], key: "ok", why: "Строка в порядке." },
  { id: "c8", sheet: "Матчи", cells: ["M07 (второй раз)", "T02", "T03", "Длительность 41"], key: "dup", why: "M07 записан дважды — Удалить дубликаты." },
  { id: "c9", sheet: "Матчи", cells: ["M09", "T02", "T04", "Длительность «33 мин»"], key: "dur", why: "Текст: ПОДСТАВИТЬ «мин» и ЗНАЧЕН → 33." },
  { id: "c10", sheet: "Матчи", cells: ["M13", "T01", "T08", "Счёт 02:01:00"], key: "time", why: "Счёт стал временем: =ЧАС&\":\"&МИНУТЫ → 2:1." },
  { id: "c11", sheet: "Инциденты", cells: ["INC03", "M08", "«сеть»", "6 мин"], key: "space", why: "Регистр: «сеть» и «Сеть» — для сводной разные типы." },
  { id: "c12", sheet: "Зрители", cells: ["M15", "Twitch", "Пик «1 120» (текст)", "784"], key: "numtext", why: "Пробел внутри числа — ПОДСТАВИТЬ пробел и ЗНАЧЕН." },
  { id: "c13", sheet: "Логи сервера", cells: ["LOG02", "M02", "Пинг 29", "Потери «0.3»"], key: "numtext", why: "Точка вместо запятой — текст. Ctrl+H «.» → «,»." },
  { id: "c14", sheet: "Логи сервера", cells: ["LOG09", "M09", "Пинг 103", "Потери 01.08.2026"], key: "numtext", why: "Число превратилось в дату: =ДЕНЬ+МЕСЯЦ/10 → 1,8." },
];

export function reviewClean(w: Workbook): ReviewCard[] {
  const c: ReviewCard = { title: "Очистка: найденные ловушки", max: "", good: [], bad: [] };
  let right = 0;
  for (const r of CLEAN_ROWS) {
    const a = str(w, r.id);
    if (!a) c.bad.push(`${r.sheet}, ${r.cells[0]}: не отмечено. ${r.why}`);
    else if (a === r.key) right++;
    else c.bad.push(`${r.sheet}, ${r.cells[0]}: неверно. ${r.why}`);
  }
  c.good.unshift(`Верно определено: ${right} из ${CLEAN_ROWS.length}.`);
  const q: ReviewCard = { title: "Цифры после очистки", max: "", good: [], bad: [] };
  const check = (id: string, key: number, label: string, hint: string) => {
    const v = num(str(w, id));
    if (v === key) q.good.push(`${label}: ${key} — верно.`);
    else q.bad.push(`${label}: у тебя ${str(w, id) || "пусто"}, правильно ${key}. ${hint}`);
  };
  check("n_teams", 8, "Уникальных команд", "T03 повторяется, «Квант» записан под T07 и T09.");
  check("n_matches", 15, "Уникальных матчей", "M07 и M13 записаны дважды.");
  check("n_inc", 10, "Уникальных инцидентов", "INC06 записан дважды.");
  if (str(w, "log").length >= 80) q.good.push("Журнал очистки заполнен.");
  else q.bad.push("Журнал очистки слишком короткий: что нашёл, где, что сделал — по строке на каждую ловушку.");
  return [c, q];
}

/* ---------- 2. Ключевые цифры (считает в Excel, вписывает сюда) ---------- */

export const CALC_FIELDS: { id: string; label: string; key: number | string; tol?: number; hint: string }[] = [
  { id: "k_teams", label: "Команд", key: 8, hint: "После удаления повторов T03 и T09." },
  { id: "k_players", label: "Игроков всего", key: 41, hint: "=СУММ по «Кол-во_игроков» без дублей: 7 команд по 5 и Blue Fox — 6." },
  { id: "k_matches", label: "Матчей", key: 15, hint: "=СЧЁТЗ по ID_матча после удаления дублей." },
  { id: "k_inc", label: "Инцидентов", key: 10, hint: "Без дубля INC06." },
  { id: "k_net", label: "Сетевых инцидентов", key: 5, hint: "=СЧЁТЕСЛИ после приведения «сеть» и «Сеть » к «Сеть»." },
  { id: "k_netmin", label: "Минут простоя из-за сети", key: 25, hint: "=СУММЕСЛИ(тип;\"Сеть\";длительность)." },
  { id: "k_avg", label: "Средняя длительность Bo1, мин", key: 46.6, tol: 0.1, hint: "12 матчей группы; M04 = 36, M09 = 33. =СРЗНАЧ → 46,58." },
  { id: "k_long", label: "Самый длинный матч (ID)", key: "M15", hint: "Финал, 142 мин." },
  { id: "k_top5", label: "Топ-5 по длительности (ID через запятую)", key: "M15,M13,M14,M06,M10", hint: "142, 131, 84, 62, 58 — после исправления M04 и M09 и без дубля M13." },
  { id: "k_peak", label: "Пик зрителей финала", key: 1120, hint: "«1 120» — текст, его надо превратить в число." },
  { id: "k_evening", label: "Инцидентов в матчах, начавшихся в 17:00 и позже", key: 8, hint: "Сводная «час начала → количество инцидентов»: M07–M12 и M15." },
];

export function reviewCalc(w: Workbook): ReviewCard[] {
  const c: ReviewCard = { title: "Ключевые цифры", max: "", good: [], bad: [] };
  for (const f of CALC_FIELDS) {
    const raw = str(w, f.id);
    let ok: boolean;
    if (typeof f.key === "number") ok = raw !== "" && Math.abs(num(raw) - f.key) <= (f.tol ?? 0);
    else ok = raw.toUpperCase().replace(/[^A-Z0-9,]/g, "").replace(/,+/g, ",") === f.key;
    if (ok) c.good.push(`${f.label}: верно.`);
    else c.bad.push(`${f.label}: у тебя ${raw || "пусто"}, правильно ${f.key}. ${f.hint}`);
  }
  const fx = str(w, "k_formula");
  if (/СЧЁТЕСЛИ|СЧЕТЕСЛИ|COUNTIF/i.test(fx)) c.good.push("Формула для сетевых сбоев — СЧЁТЕСЛИ.");
  else c.bad.push("Напиши формулу, которой считал сетевые сбои, например =СЧЁТЕСЛИ(Инциденты!D:D;\"Сеть\").");
  return [c];
}

/* ---------- 3. Диаграммы и выводы ---------- */

export const CHART_TYPES = ["Гистограмма (столбцы)", "Линейчатая (горизонтальные полосы)", "График (линия)", "Круговая / кольцевая", "Точечная"];

export const CHART_QUESTIONS: { id: string; q: string; ok: string[]; why: string }[] = [
  { id: "ch1", q: "Распределение матчей по времени (по часам начала)", ok: ["Гистограмма (столбцы)"], why: "Сравнение категорий (часов) — столбцы." },
  { id: "ch2", q: "Типы технических инцидентов (доли)", ok: ["Круговая / кольцевая", "Гистограмма (столбцы)"], why: "Доли целого — кольцевая; количество по типам — столбцы." },
  { id: "ch3", q: "Топ-5 самых длительных матчей", ok: ["Линейчатая (горизонтальные полосы)"], why: "Рейтинг — горизонтальные полосы по убыванию." },
  { id: "ch4", q: "Динамика зрительского интереса от первого матча к финалу", ok: ["График (линия)"], why: "Изменение во времени — линия." },
  { id: "ch5", q: "Связь пинга сервера и числа сбоев", ok: ["Точечная"], why: "Связь двух чисел — точечная." },
];

export function reviewCharts(w: Workbook): ReviewCard[] {
  const c: ReviewCard = { title: "Диаграммы и заголовки-выводы", max: "", good: [], bad: [] };
  for (const q of CHART_QUESTIONS) {
    const t = str(w, `${q.id}t`);
    const h = str(w, `${q.id}h`);
    if (q.ok.includes(t)) c.good.push(`«${q.q}»: тип выбран верно.`);
    else c.bad.push(`«${q.q}»: ${t ? `«${t}» не лучший выбор` : "тип не выбран"}. ${q.why}`);
    if (!h) c.bad.push(`«${q.q}»: нет заголовка-вывода.`);
    else if (!/\d/.test(h)) c.bad.push(`«${q.q}»: заголовок «${h}» — тема, а не вывод. Добавь цифру: что именно показывает диаграмма.`);
    else c.good.push(`«${q.q}»: заголовок с цифрой — это вывод.`);
  }
  return [c];
}

/* ---------- 4. Презентация на 5 слайдов и рекомендации ---------- */

export const PRES_SLIDES = [
  { id: "p1", t: "1. Титул", hint: "Название турнира, «Итоги и рекомендации», номер участника." },
  { id: "p2", t: "2. Турнир в цифрах", hint: "4–6 крупных чисел из отчёта." },
  { id: "p3", t: "3. Главная проблема", hint: "Какая диаграмма и какой вывод на заголовке." },
  { id: "p4", t: "4. Зрители", hint: "Линия динамики + вывод." },
  { id: "p5", t: "5. Рекомендации", hint: "3 рекомендации ниже — по схеме проблема → действие → результат." },
];
export const RECS = [
  { id: "r1", t: "Расписание" },
  { id: "r2", t: "Техническое оснащение" },
  { id: "r3", t: "Формат проведения" },
];

export function reviewPres(w: Workbook): ReviewCard[] {
  const c: ReviewCard = { title: "Презентация", max: "", good: [], bad: [] };
  const filled = PRES_SLIDES.filter((s) => str(w, `${s.id}h`) || str(w, `${s.id}b`)).length;
  if (filled === 5) c.good.push("Все 5 слайдов заполнены — ровно лимит «не более 5».");
  else c.bad.push(`Заполнено слайдов: ${filled} из 5.`);
  if (/(участник|№)/i.test(str(w, "p1h") + str(w, "p1b"))) c.good.push("На титуле есть номер участника.");
  else c.bad.push("На титуле нет номера участника.");
  if ((str(w, "p2b").match(/\d+/g) || []).length >= 4) c.good.push("«Турнир в цифрах» — не меньше 4 чисел.");
  else c.bad.push("На слайде «Турнир в цифрах» меньше 4 чисел.");
  for (const s of ["p3", "p4"]) {
    if (/\d/.test(str(w, `${s}h`))) c.good.push(`Слайд ${s.slice(1)}: заголовок-вывод с цифрой.`);
    else c.bad.push(`Слайд ${s.slice(1)}: заголовок без цифры — напиши вывод, а не тему.`);
  }
  const r: ReviewCard = { title: "Рекомендации организаторам", max: "", good: [], bad: [] };
  for (const x of RECS) {
    const p = str(w, `${x.id}p`), a = str(w, `${x.id}a`), e = str(w, `${x.id}e`);
    if (!p || !a || !e) r.bad.push(`${x.t}: заполни все три части — проблема, действие, результат.`);
    else if (!/\d/.test(p)) r.bad.push(`${x.t}: в проблеме нет цифры из отчёта — рекомендация без цифры тянет на «1».`);
    else r.good.push(`${x.t}: проблема с цифрой → действие → результат.`);
  }
  return [c, r];
}

export function reviewB(id: string, w: Workbook): ReviewCard[] {
  if (id === "b-clean") return reviewClean(w);
  if (id === "b-calc") return reviewCalc(w);
  if (id === "b-charts") return reviewCharts(w);
  if (id === "b-pres") return reviewPres(w);
  return [];
}
