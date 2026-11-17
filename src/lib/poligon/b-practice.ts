import type { Workbook } from "./a-practicum";
import { makeBDataset, type BDataset } from "./b-dataset";

/** Новая версия практики не меняет ключи и разбор «Осеннего кубка». */
export const B_PRACTICE_IDS = ["b-practice-clean", "b-practice-report", "b-practice-visual", "b-practice-delivery", "b-practice-full"] as const;
export type BPracticeId = typeof B_PRACTICE_IDS[number];
export type BCheck = { id: string; aspectIds: string[]; label: string; ok: boolean | null; feedback: string };
export type BReview = { checks: BCheck[]; failedIds: string[] };
export function isBPractice(id: string): id is BPracticeId { return (B_PRACTICE_IDS as readonly string[]).includes(id); }
export const B_MODES = { guided: "С подсказками", independent: "Самостоятельно", retry: "Повторить ошибки" };
export function bSections(id: string) {
  return { clean: id.endsWith("clean") || id.endsWith("full"), report: id.endsWith("report") || id.endsWith("full"), visual: id.endsWith("visual") || id.endsWith("full"), delivery: id.endsWith("delivery") || id.endsWith("full") };
}
export const B_PIVOTS = [
  { id: "time", title: "Матчи по времени", row: "Час начала", column: "Нет", value: "ID_матча", operation: "Количество", hint: "На листе Матчи добавь столбец Час начала. Вставка → Сводная таблица: Строки — Час начала; Столбцы — пусто; Значения — ID_матча; Параметры поля значений → Количество." },
  { id: "incident", title: "Типы инцидентов", row: "Тип", column: "Нет", value: "ID_инцидента", operation: "Количество", hint: "Выдели таблицу Инциденты → Вставка → Сводная таблица. Строки — Тип; Столбцы — пусто; Значения — ID_инцидента; операция — Количество. Событие без длительности тоже считается." },
  { id: "platform", title: "Зрители по платформам", row: "Платформа", column: "Нет", value: "Зрителей", operation: "Сумма", hint: "Источник — лист Зрители. Строки — Платформа; Столбцы — пусто; Значения — Зрителей; операция — Сумма. Это сумма наблюдений, не число уникальных людей." },
] as const;
export function bPivots(version: number) {
  return B_PIVOTS.map(p => p.id === "platform" && version >= 2 ? { ...p,
    title: "Пик зрителей каждого матча по платформам", row: "ID_матча", column: "Платформа", operation: "Максимум",
    hint: "Лист Зрители → Вставка → Сводная таблица. Строки — ID_матча; Столбцы — Платформа; Значения — Зрителей → Максимум. Это пик отдельной трансляции, не сумма уникальных людей. Дату и порядок матчей сверяй с листом Матчи." } : p);
}
export function bPivotGroups(d: BDataset, id: string, version: number): Record<string, number> {
  if (id === "time") return d.totals.byHour;
  if (id === "incident") return d.totals.byIncident;
  if (version < 2) return d.totals.byPlatform;
  return Object.fromEntries(d.viewers.map(v => [`${v.matchId} · ${v.platform}`, v.viewers]));
}
export const B_CHARTS = [
  { id: "hours", title: "Сравнить число матчей по часам начала", types: ["Столбцы"], hint: "Построй столбцы: X — час начала, Y — количество матчей. Подпиши единицы." },
  { id: "top", title: "Показать топ-5 по длительности", types: ["Полосы"], hint: "Отсортируй длительность по убыванию, выбери первые 5 матчей → Вставка → Линейчатая. Подпиши минуты." },
  { id: "audience", title: "Сравнить зрителей по платформам", types: ["Столбцы", "Полосы", "Кольцо"], hint: "Сначала сводная: Платформа → Сумма зрителей. Для сравнения подходят полосы; доли можно показать кольцом. Укажи, что это сумма наблюдений." },
] as const;
export function bCharts(version: number) {
  return B_CHARTS.map(c => c.id === "audience" && version >= 2 ? { ...c,
    title: "Показать изменение пика Twitch по времени", types: ["Линия"],
    hint: "На листе Зрители выбери платформу Twitch. По листу Матчи расположи встречи по дате и времени. Выдели ID матчей и пики → Вставка → График с маркерами. Подпиши «Twitch, пиковые зрители, чел.»." } : c);
}
export function bDelivery(seed: string) {
  const n = 1 + [...seed].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 40;
  const number = String(n).padStart(2, "0");
  return { number, rows: [
    { id: "data", before: `Рабочий стол/Уч${number}/Обработанные_данные_Уч${number}_старые.xlsx`, action: "replace", after: `Рабочий стол/Уч${number}/Обработанные_данные_Уч${number}.xlsx`, hint: "Сохрани текущую обработанную книгу в папке сдачи. Устаревшую копию вынеси в Архив, затем открой актуальную." },
    { id: "number", before: `Рабочий стол/Уч${number}/Аналитический_отчёт_Уч99.xlsx`, action: "rename", after: `Рабочий стол/Уч${number}/Аналитический_отчёт_Уч${number}.xlsx`, hint: "Файл → Сохранить как: в имени должен быть твой номер участника." },
    { id: "report", before: "Аналитический отчёт не сохранён: только открытая книга Excel", action: "save", after: `Рабочий стол/Уч${number}/Аналитический_отчёт_Уч${number}.xlsx`, hint: "Сохрани отчёт в папку сдачи; не путай его с исходными данными." },
    { id: "slides", before: `Загрузки/Презентация_Б_Уч${number}.pptx`, action: "move", after: `Рабочий стол/Уч${number}/Презентация_Б_Уч${number}.pptx`, hint: "Перемести готовую презентацию в папку сдачи; проверь имя и открой файл из этой папки." },
  ] };
}
const text = (w: Workbook, id: string) => String(w[id] ?? "").trim();
const number = (s: string) => s.trim() === "" ? NaN : Number(s.replace(/\s/g, "").replace(",", "."));
export function reviewBPractice(variantId: string, w: Workbook): BReview {
  const checks: BCheck[] = [];
  const add = (id: string, aspectIds: string[], label: string, ok: boolean | null, feedback: string) => checks.push({ id, aspectIds, label, ok, feedback });
  if (!isBPractice(variantId) || !text(w, "_b_seed")) return { checks, failedIds: [] };
  const version = text(w, "_b_version") === "2" ? 2 : 1;
  const d = makeBDataset(text(w, "_b_seed"), version);
  const s = bSections(variantId);
  if (s.clean) for (const c of d.cleaningCases) {
    const fields = text(w, `fields_${c.id}`).split("|").filter(Boolean).sort();
    const expected = [...c.fields].sort();
    const ok = text(w, `decision_${c.id}`) === c.decision && JSON.stringify(fields) === JSON.stringify(expected) && text(w, `compare_${c.id}`) === c.comparison;
    add(`clean_${c.id}`, ["b1-2", "b1-4", "b1-6"], c.title, ok, `${c.why} ${c.impact} Excel: ${c.excel}`);
  }
  if (s.report) {
    if (version >= 2) add("calc_known", ["b1-6", "b2-3"], "События с известной длительностью", number(text(w, "calc_known")) === d.totals.knownDurations,
      `Из ${d.totals.incidents} событий длительность известна у ${d.totals.knownDurations}. Excel: на листе Инциденты посчитай ID через СЧЁТЗ, а числа в Длительность_мин — через СЧЁТ. Пустые ячейки оставь пустыми.`);
    for (const [id, label, expected] of [["teams", "Команды", d.totals.teams], ["players", "Игроки", d.totals.players], ["matches", "Матчи", d.totals.matches], ["incidents", "Инциденты", d.totals.incidents], ["network", "Известные минуты сетевых сбоев", d.totals.networkMinutes]] as const) {
      add(`calc_${id}`, ["b2-3"], label, number(text(w, `calc_${id}`)) === expected, `Для этого варианта: ${expected}. Excel: очисти повторы, затем СЧЁТЗ для ID или СУММ для чисел. Не подставляй 0 вместо неизвестной длительности.`);
    }
    add("top5", ["b2-3"], "Топ-5 длительности", text(w, "top5").toUpperCase().split(/[,;\s]+/).filter(Boolean).join(",") === d.totals.top5.join(","), `Правильный порядок: ${d.totals.top5.join(", ")}. Excel: выдели всю таблицу Матчи → Данные → Сортировка → Длительность_мин → По убыванию. При равной длительности ID по возрастанию.`);
    for (const p of bPivots(version)) {
      const ok = text(w, `${p.id}_row`) === p.row && text(w, `${p.id}_column`) === p.column && text(w, `${p.id}_value`) === p.value && text(w, `${p.id}_operation`) === p.operation;
      add(`pivot_${p.id}`, ["b2-3"], `Настройка: ${p.title}`, ok, p.hint);
      const groups = bPivotGroups(d, p.id, version);
      Object.entries(groups).forEach(([key, value], index) => add(`aggregate_${p.id}_${index}`, ["b2-3"], `${p.title}: ${key}`, number(text(w, `agg_${p.id}_${index}`)) === value, `В варианте ${key}: ${value}. ${p.hint} Дважды щёлкни итог сводной, чтобы увидеть исходные строки.`));
    }
    const [a, b] = d.totals.top5.map(id => d.matches.find(m => m.id === id)!);
    const diff = a.duration - b.duration;
    const evidenceOk = text(w, "evidence_a") === a.id && text(w, "evidence_b") === b.id && number(text(w, "evidence_diff")) === diff && text(w, "evidence_source") === "Матчи";
    add("evidence", ["b2-5", "b2-6"], "Из каких данных следует сравнение", evidenceOk, `Лист Матчи: ${a.id} — ${a.duration}, ${b.id} — ${b.duration} мин; разница ${diff}. Excel: найди эти ID фильтром и вычти длительности. Разница не доказывает опоздание: планового окончания нет.`);
    add("report_meaning", ["b2-5", "b2-6", "b2-7"], "Обоснование вывода и соответствие шаблону", null, "Ожидает проверки наставника. Покажи связь: вопрос → исходные строки → показатель → ограничение → решение. Шаблон берём из задания, не выдумываем требования к шрифтам.");
  }
  if (s.clean && version >= 2) add("clean_rationale", ["b1-6"], "Объяснение неоднозначного подсчёта", null,
    "Ожидает проверки наставника. В журнале укажи ID записи, какие сведения известны, в какой подсчёт включаешь событие и почему. Другой обоснованный способ учёта наставник рассмотрит вручную; длина текста не подтверждает правильность.");
  if (s.visual) {
    for (const c of bCharts(version)) add(`chart_${c.id}`, ["b3-6"], c.title, (c.types as readonly string[]).includes(text(w, `chart_${c.id}`)), c.hint);
    const claim = text(w, "visual_claim");
    add("claim", ["b3-4"], "Вывод связан с данными", null, !claim || /^\s*(диаграмма|график|слайд)\s*\d+\s*$/i.test(claim) ? "Ожидает проверки наставника. «Диаграмма 3» — название, а не вывод. Напиши что сравниваешь, значения и ограничение; укажи лист и строки. Excel: проверь источник через Выбрать данные." : "Ожидает проверки наставника: наличие текста ещё не доказывает точность вывода. Наставник сравнит его с источником, типом диаграммы и шкалой конкурса.");
    add("visual_judgement", ["b3-3", "b3-5", "b3-6"], "Смысл, подписи, легенда и читаемость графиков", null, "Ожидает проверки наставника по конкурсной шкале. Открой отчёт в Excel и презентацию в режиме показа; проверь подписи, единицы, масштаб и обоснованность выбора.");
  }
  if (s.delivery) {
    for (const r of bDelivery(text(w, "_b_seed")).rows) add(`delivery_${r.id}`, ["b1-1", "b2-1", "b2-4"], r.before, text(w, `delivery_${r.id}`) === r.action, r.hint);
    add("delivery_open", ["b4-2"], "Какие копии открыть перед сдачей", text(w, "open_pc") === "current" && text(w, "open_usb") === "current", "Открой все три актуальных файла из папки сдачи на ПК и затем с физической флешки. Сайт проверяет только ответ, фактические носители — наставник.");
    add("workplace", ["b4-1", "b4-2"], "Очная репетиция", null, "Ожидает наблюдения наставника отдельно по Б4.1 и Б4.2. Браузер не подтверждает посадку, перерывы, порядок рабочего места и копию на физической флешке.");
  }
  let focus: string[] = [];
  try { focus = JSON.parse(text(w, "_b_focus") || "[]"); } catch { /* Старый черновик без списка ошибок показываем полностью. */ }
  const selected = text(w, "_b_mode") === "retry" && focus.length ? checks.filter(c => c.ok === null || focus.includes(c.id)) : checks;
  return { checks: selected, failedIds: selected.filter(c => c.ok === false).map(c => c.id) };
}
