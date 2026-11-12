/*
 * Модуль А за 4 часа: случайная вводная, 4 задания по очереди в настоящих файлах
 * и автопроверка измеряемых аспектов (И) по критериям чемпионата.
 * Этот файл общий для браузера и сервера: здесь нет чтения файлов, только правила.
 * Сами файлы (.docx, .pptx) разбирает сервер — см. src/lib/poligon/office.ts.
 */

/* ---------------- Случайная вводная ---------------- */

export type ABrief = {
  game: string;          // «Dota 2»
  official: string;      // название дисциплины по правилам вида спорта: «боевая арена»
  dateIso: string;       // «2027-03-20»
  dateText: string;      // «20 марта 2027»
  venue: string;         // площадка
  seats: number;         // игровых мест
  open: string;          // зал открыт с
  close: string;         // зал открыт до (финал и награждение должны успеть)
  budget: number;        // бюджет вместе с призовым фондом, ₽
  sponsor: string;       // кому делаем презентацию
  twist: string;         // особое условие организатора
};

const GAMES = [
  { game: "Dota 2", official: "боевая арена" },
  { game: "Counter-Strike 2", official: "тактический трёхмерный бой" },
  { game: "Mobile Legends: Bang Bang", official: "боевая арена" },
];
/** Субботы весны 2027 */
const DATES = ["2027-03-13", "2027-03-20", "2027-03-27", "2027-04-03", "2027-04-10", "2027-04-17", "2027-04-24"];
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const VENUES = [
  "молодёжный центр — площадка городского фестиваля",
  "колледж — площадка городского фестиваля",
  "атриум торгового центра — площадка городского фестиваля",
  "дворец творчества — площадка городского фестиваля",
];
const SEATS = [20, 24, 30];
const HOURS: [string, string][] = [["09:00", "19:00"], ["10:00", "20:00"], ["09:00", "18:30"]];
const BUDGETS = [150_000, 180_000, 200_000, 250_000];
const SPONSORS = [
  "магазин компьютерной техники",
  "оператор мобильной связи",
  "банк с молодёжной картой",
  "производитель игровой периферии",
  "онлайн-школа программирования",
];
const TWISTS = [
  "Финал обязательно транслируется онлайн (VK Видео) с комментаторами.",
  "На площадке есть зона для зрителей до 150 человек — финал играется на сцене.",
  "Организатор просит матч за 3-е место — призёров должно быть трое.",
  "Часть игровых мест нужна под запас: 2 ПК должны стоять резервными.",
];

/** Случайный элемент массива; rand — функция от 0 до 1 (в браузере Math.random) */
const pick = <T,>(arr: T[], rand: () => number) => arr[Math.floor(rand() * arr.length)];

/** «2027-03-20» → «20 марта 2027» */
export function dateRu(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Собрать новую случайную вводную */
export function makeBrief(rand: () => number): ABrief {
  const g = pick(GAMES, rand);
  const dateIso = pick(DATES, rand);
  const [open, close] = pick(HOURS, rand);
  return {
    game: g.game,
    official: g.official,
    dateIso,
    dateText: dateRu(dateIso),
    venue: pick(VENUES, rand),
    seats: pick(SEATS, rand),
    open,
    close,
    budget: pick(BUDGETS, rand),
    sponsor: pick(SPONSORS, rand),
    twist: pick(TWISTS, rand),
  };
}

/** Прочитать вводную из тетради (там она хранится строкой JSON) */
export function parseBrief(raw: unknown): ABrief | null {
  try {
    const b = JSON.parse(String(raw || ""));
    return b && typeof b.game === "string" && typeof b.dateIso === "string" ? (b as ABrief) : null;
  } catch {
    return null;
  }
}

/** Вводная строками «как на брифинге» */
export function briefRows(b: ABrief): [string, string][] {
  return [
    ["Турнир", "Любительский турнир «Кубок Профессионалов» в рамках городского фестиваля"],
    ["Дисциплина", `${b.game} (по правилам вида спорта — «${b.official}»)`],
    ["Заказчик", "Федерация компьютерного спорта России"],
    ["Команд", "8"],
    ["Целевая аудитория", "Молодёжь 16–25 лет"],
    ["Дата", `${b.dateText}, один день`],
    ["Место", `Санкт-Петербург, ${b.venue}`],
    ["Игровые места", `${b.seats} ПК, офлайн (LAN)`],
    ["Зал доступен", `с ${b.open} до ${b.close} — награждение должно закончиться до закрытия`],
    ["Бюджет", `не больше ${b.budget.toLocaleString("ru-RU")} ₽ вместе с призовым фондом`],
    ["Презентация для", `потенциального спонсора — ${b.sponsor}`],
    ["Особое условие", b.twist],
  ];
}

/* ---------------- Задания по очереди ---------------- */

export type AStageId = "reg" | "grid" | "pres" | "app";

export const A_STAGES: {
  id: AStageId;
  n: number;
  title: string;
  minutes: number;
  task: string;
  file: string;      // как назвать файл
  accept: string;    // какие файлы принимаем
  tips: string[];
}[] = [
  {
    id: "reg", n: 1, title: "Регламент турнира", minutes: 80,
    task: "Разработай регламент (положение) турнира: формат и система проведения, критерии допуска участников, расписание, призовой фонд (условный). Пять обязательных разделов и семь дополнительных.",
    file: "Регламент_Уч№ (.docx или .pdf)",
    accept: ".docx,.pdf",
    tips: [
      "Пять обязательных разделов — с точными названиями: «Общие положения», «Участники», «Формат соревнований», «Расписание», «Награждение».",
      "Дисциплину называй как в правилах вида спорта (смотри вводную).",
      "Расписание — каждый матч отдельной строкой; последнее событие — до закрытия зала.",
    ],
  },
  {
    id: "grid", n: 2, title: "Турнирная сетка", minutes: 25,
    task: "Сформируй турнирную сетку для 8 команд (онлайн-сервис или вручную) с учётом формата из регламента.",
    file: "Сетка_Уч№ (.png / .jpg) или ссылка на сетку",
    accept: ".png,.jpg,.jpeg",
    tips: [
      "Дата и время матчей — те же, что в расписании регламента.",
      "Скриншот без кнопок редактирования, все этапы и матч за 3-е место (если он есть в регламенте).",
    ],
  },
  {
    id: "pres", n: 3, title: "Презентация для спонсора", minutes: 95,
    task: "Подготовь презентацию проекта для потенциального спонсора: описание турнира, смета, ожидаемые результаты.",
    file: "Презентация_А_Уч№ (.pptx или .pdf)",
    accept: ".pptx,.pdf",
    tips: [
      "Титульный слайд: название турнира и «Участник № …».",
      "Не меньше 5 слайдов, отдельный слайд со сметой (итог — в пределах бюджета) или рисками.",
      "Призовой фонд и дата — те же, что в регламенте.",
    ],
  },
  {
    id: "app", n: 4, title: "Заявка на мероприятие", minutes: 30,
    task: "Заполни заявку на проведение мероприятия по форме (Приложение 6).",
    file: "Заявка_Уч№ (.docx или .pdf)",
    accept: ".docx,.pdf",
    tips: ["Ни одного пустого поля. Цифры — те же, что в регламенте и смете: дата, 8 команд, участники, призовой фонд."],
  },
];

/* ---------------- Что вытащил сервер из файлов ---------------- */

/** Абзац документа: текст и выделен ли он (жирный или стиль заголовка) */
export type DocPara = { text: string; strong: boolean };
export type Extract =
  | { kind: "docx"; paras: DocPara[]; tables: string[][][] }
  | { kind: "pptx"; slides: string[] }
  | { kind: "image" }
  | { kind: "link"; url: string }
  | { kind: "pdf" }
  | { kind: "none" }
  | { kind: "error"; message: string };

export type StageFile = { name: string; extract: Extract };

/* ---------------- Отчёт ---------------- */

export type Aspect = {
  id: string;           // a1-1…
  title: string;
  weight: number;
  got: number | null;   // null — не проверено автоматически (самопроверка или PDF)
  note: string;         // почему так
};
export type ReportPart = { stage: AStageId; title: string; aspects: Aspect[]; extra: { ok: boolean; text: string }[] };
export type AReport = { at: string; parts: ReportPart[]; cross: { ok: boolean; text: string }[] };

/** Самопроверка: аспекты, которые эксперт смотрит глазами — ученик честно отмечает сам */
export const A_SELF = [
  { id: "a2-2", key: "self_grid", weight: 0.5, title: "Сетка для 8 команд, отображены все этапы", hint: "8 команд, четвертьфиналы → полуфиналы → финал (и матч за 3-е место, если он в регламенте)" },
  { id: "a5-1", key: "self_ot", weight: 0.5, title: "Охрана труда: осанка, перерывы", hint: "Сидел ровно, монитор на 50–70 см, делал перерыв раз в час" },
  { id: "a5-2", key: "self_lean", weight: 0.5, title: "Бережливое производство: порядок на рабочем месте", hint: "На столе только нужное, файлы в одной папке с понятными именами, ничего не печатал зря" },
];

/* ---------------- Помощники ---------------- */

const low = (s: string) => s.toLowerCase().replace(/ё/g, "е");
/** Имя файла без пробелов и в нижнем регистре: «Регламент_Уч№ 4.docx» → «регламент_уч№4.docx» */
const fname = (s: string) => low(s).replace(/\s+/g, "");
const ext = (s: string) => (s.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();
/** «Регламент_Уч№4», «Регламент_Уч4», «Регламент_Уч_4» — все варианты номера участника */
const named = (name: string, base: string) => new RegExp(`^${base}_уч(№|n|_)?\\d+`).test(fname(name));

/** Весь текст файла одной строкой */
export function allText(x: Extract): string {
  if (x.kind === "docx") return [...x.paras.map((p) => p.text), ...x.tables.flat(2)].join("\n");
  if (x.kind === "pptx") return x.slides.join("\n");
  return "";
}

/** Все времена «10:00» в тексте */
const times = (t: string) => (t.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/g) || []).map((x) => x.padStart(5, "0"));
/** Число после слова: «призовой фонд — 30 000 ₽» → 30000 */
function numAfter(t: string, word: RegExp): number | null {
  const m = low(t).match(new RegExp(word.source + "[^\\d\\n]{0,40}(\\d[\\d\\s .]*\\d|\\d)"));
  if (!m) return null;
  const v = Number(m[m.length - 1].replace(/[\s .]/g, ""));
  return Number.isFinite(v) && v > 0 ? v : null;
}
/**
 * Призовой фонд: самое большое число (от 1 000) в 150 знаках после слова «призовой».
 * Так «призовой фонд: 1 место — 15 000, всего 30 000» даёт 30 000, а не «1».
 */
function prizeOf(t: string): number | null {
  const s = low(t);
  let best = 0;
  const re = /призов/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    // Смотрим до конца строки (в смете на слайде дальше идут другие статьи)
    const end = s.indexOf("\n", m.index);
    const chunk = s.slice(m.index, end < 0 ? m.index + 200 : Math.min(end, m.index + 200));
    // «30 000», «30.000», «30. 000» — разделитель тысяч бывает любым
    const nums = (chunk.match(/\d{1,3}(?:[\s .]{1,2}\d{3})+|\d+/g) ?? []).map((n) => Number(n.replace(/[\s .]/g, ""))).filter((v) => v >= 1000);
    if (!nums.length) continue;
    // Только суммы по местам (15 000, 10 000, 5 000) без «всего / составляет» — складываем; иначе берём самое большое
    const onlyPlaces = /мест/.test(chunk) && !/(всего|итого|общ|составля|размер)/.test(chunk);
    const total = onlyPlaces ? nums.reduce((a, v) => a + v, 0) : Math.max(...nums);
    if (total > best) best = total;
  }
  return best || null;
}

/** Есть ли в тексте дата вводной: «20 марта», «20.03», «2027-03-20» */
function hasDate(t: string, b: ABrief) {
  const [, m, d] = b.dateIso.split("-");
  const day = String(Number(d));
  const s = low(t);
  return (
    new RegExp(`(^|\\D)0?${day}\\s+${MONTHS[Number(m) - 1].slice(0, 4)}`).test(s) ||
    new RegExp(`(^|\\D)0?${day}\\.${m}(\\.|\\b)`).test(s) ||
    s.includes(b.dateIso)
  );
}

export const MUST_TITLES = ["Общие положения", "Участники", "Формат соревнований", "Расписание", "Награждение"];
export const EXTRA_TITLES = ["Замены", "Технические", "Судейство", "Санкции", "Спорн", "Безопасность", "Заключительн"];

/** Найти абзац-заголовок раздела: «1. Общие положения», «Общие положения» (короткая строка) */
function findTitle(paras: DocPara[], title: string): DocPara | null {
  const want = low(title);
  for (const p of paras) {
    const t = low(p.text).replace(/^\s*(раздел\s*)?\d+[.)]?\s*/, "").trim();
    if (t.startsWith(want) && t.length <= want.length + 25) return p;
  }
  return null;
}

/** Пустые поля заявки: строка таблицы, где есть подпись, а остальные ячейки пустые или «____» */
export function emptyFields(tables: string[][][]): string[] {
  const out: string[] = [];
  const blank = (s: string) => !s.replace(/[_.\s…—-]/g, "").length;
  for (const tb of tables) {
    for (const row of tb) {
      if (row.length < 2) continue;
      const [label, ...rest] = row;
      if (!blank(label) && rest.every(blank)) out.push(label.trim().slice(0, 60));
    }
  }
  return out;
}

/* ---------------- Проверка ---------------- */

/** Аспект «наличие файла»: имя по шаблону и нужный формат */
function fileAspect(id: string, title: string, f: StageFile | undefined, base: string, exts: string[], linkOk = false): Aspect {
  if (!f || f.extract.kind === "none") return { id, title, weight: 0.5, got: 0, note: "Файл не загружен." };
  if (linkOk && f.extract.kind === "link") return { id, title, weight: 0.5, got: 0.5, note: "Сдана ссылка на сетку." };
  const okName = named(f.name, base);
  const okExt = exts.includes(ext(f.name));
  if (okName && okExt) return { id, title, weight: 0.5, got: 0.5, note: `«${f.name}» — имя и формат верные.` };
  const why = [!okName && `имя должно начинаться с «${base[0].toUpperCase() + base.slice(1)}_Уч№…»`, !okExt && `формат — ${exts.map((e) => "." + e).join(" или ")}`].filter(Boolean).join(", ");
  return { id, title, weight: 0.5, got: 0, note: `«${f.name}»: ${why}. За это снимают балл, даже если внутри всё отлично.` };
}

/** Проверить все 4 файла по вводной */
export function checkAFour(b: ABrief, files: Partial<Record<AStageId, StageFile>>): AReport {
  const parts: ReportPart[] = [];
  const pdfNote = "PDF принят, но сайт не читает PDF — проверь сам. Для автопроверки сдавай .docx / .pptx.";

  /* --- 1. Регламент --- */
  {
    const f = files.reg;
    const x = f?.extract;
    const aspects: Aspect[] = [fileAspect("a1-1", "Файл «Регламент_Уч№…» (.docx/.pdf)", f, "регламент", ["docx", "pdf"])];
    const extra: ReportPart["extra"] = [];
    if (x?.kind === "docx") {
      const found = MUST_TITLES.map((t) => findTitle(x.paras, t));
      const miss = MUST_TITLES.filter((_, i) => !found[i]);
      aspects.push({
        id: "a1-2", title: "5 обязательных разделов с точными названиями", weight: 1,
        got: miss.length ? 0 : 1,
        note: miss.length ? `Не найдены заголовки: ${miss.map((m) => `«${m}»`).join(", ")}. Нет одного или назван иначе — 0 баллов.` : "Все 5 заголовков на месте.",
      });
      const t = allText(x);
      const lt = low(t);
      const extraFound = EXTRA_TITLES.filter((e) => x.paras.some((p) => p.text.length < 80 && low(p.text).replace(/^\s*\d+[.)]?\s*/, "").startsWith(low(e))));
      extra.push({ ok: extraFound.length >= 7, text: `Дополнительных разделов: ${extraFound.length} из 7 (замены, техпроблемы, судейство, санкции, споры, безопасность, заключительные).` });
      extra.push({ ok: found.every((p) => !p || p.strong), text: found.every((p) => !p || p.strong) ? "Заголовки разделов выделены (жирный или стиль заголовка)." : "Не все заголовки выделены — сделай их жирными или стилем «Заголовок 1»." });
      extra.push({ ok: /участник\s*№\s*\d+/.test(lt.slice(0, 400)), text: "В начале документа — «Участник № …» с номером." });
      extra.push({ ok: lt.includes(low(b.official)), text: `Дисциплина названа по правилам вида спорта — «${b.official}».` });
      extra.push({ ok: /329/.test(t) && /(№\s*22|22\.01\.2020)/.test(t) && /554/.test(t), text: "Нормативка: 329-ФЗ, приказ № 22, приказ № 554." });
      extra.push({ ok: /353/.test(t), text: "Постановление № 353 (безопасность)." });
      extra.push({ ok: hasDate(t, b), text: `Дата из вводной — ${b.dateText}.` });
      const tt = [...new Set(times(t))].sort();
      extra.push({ ok: tt.length >= 6, text: `Расписание по матчам: найдено ${tt.length} разных значений времени (нужна строка на каждый матч).` });
      if (tt.length) {
        const last = tt[tt.length - 1];
        extra.push({ ok: last <= b.close, text: `Последнее время в расписании — ${last}, зал закрывается в ${b.close}.` });
        const first = tt[0];
        extra.push({ ok: first >= b.open, text: `Первое время — ${first}, зал открывается в ${b.open}.` });
      }
      extra.push({ ok: /резерв/.test(lt), text: "Есть резерв времени." });
      extra.push({ ok: /(один день|8 матч|восемь матч|12\s*[-–]\s*14|решающ)/.test(lt), text: "Формат обоснован расчётом (один день, 8 матчей, каждый решающий)." });
      extra.push({ ok: !/(?<![а-яё])[вб]о[13](?!\d)/i.test(t), text: "Bo1 / Bo3 набраны латиницей." });
      extra.push({ ok: !/\s[,.;:](?!\d)/.test(t), text: "Нет пробелов перед запятыми и точками." });
    } else {
      aspects.push({ id: "a1-2", title: "5 обязательных разделов с точными названиями", weight: 1, got: x?.kind === "pdf" ? null : 0, note: x?.kind === "pdf" ? pdfNote : x?.kind === "error" ? `Файл не открылся: ${x.message}` : "Нечего проверять — нет .docx." });
    }
    parts.push({ stage: "reg", title: "1. Регламент", aspects, extra });
  }

  /* --- 2. Сетка --- */
  {
    const f = files.grid;
    const aspects: Aspect[] = [fileAspect("a2-1", "Файл «Сетка_Уч№…» (.jpg/.png или ссылка)", f, "сетка", ["png", "jpg", "jpeg"], true)];
    aspects.push({ id: "a2-2", title: A_SELF[0].title, weight: 0.5, got: null, note: "Самопроверка — отметь ниже." });
    parts.push({ stage: "grid", title: "2. Сетка", aspects, extra: [] });
  }

  /* --- 3. Презентация --- */
  {
    const f = files.pres;
    const x = f?.extract;
    const aspects: Aspect[] = [fileAspect("a3-1", "Файл «Презентация_А_Уч№…» (.pptx/.pdf)", f, "презентация_[аa]", ["pptx", "pdf"])];
    const extra: ReportPart["extra"] = [];
    if (x?.kind === "pptx") {
      const n = x.slides.length;
      aspects.push({ id: "a3-2", title: "Не меньше 5 слайдов", weight: 0.5, got: n >= 5 ? 0.5 : 0, note: `Слайдов: ${n}.` });
      const s1 = low(x.slides[0] ?? "");
      const titleOk = /кубок|турнир/.test(s1) && /участник\s*№?\s*\d+|уч\s*№\s*\d+/.test(s1);
      aspects.push({
        id: "a3-3", title: "Титульный слайд: название и номер участника", weight: 0.5, got: titleOk ? 0.5 : 0,
        note: titleOk ? "На первом слайде есть название и номер участника." : `На первом слайде нет ${!/кубок|турнир/.test(s1) ? "названия турнира" : ""}${!/кубок|турнир/.test(s1) && !/участник\s*№?\s*\d+/.test(s1) ? " и " : ""}${!/участник\s*№?\s*\d+/.test(s1) ? "«Участник № …» с номером" : ""}.`,
      });
      const smeta = x.slides.findIndex((s) => /смет|риск/.test(low(s)));
      aspects.push({ id: "a3-4", title: "Слайд со сметой или анализом рисков", weight: 1, got: smeta >= 0 ? 1 : 0, note: smeta >= 0 ? `Нашёл на слайде ${smeta + 1}.` : "Нет слайда со словом «смета» или «риски» — напиши его в заголовке слайда." });
      const t = allText(x);
      const total = numAfter(t, /итого/);
      extra.push({ ok: !!total && total <= b.budget, text: total ? `Итог сметы ${total.toLocaleString("ru-RU")} ₽ — бюджет ${b.budget.toLocaleString("ru-RU")} ₽.` : "Не нашёл «Итого» в смете." });
      extra.push({ ok: /16\s*[-–]\s*25/.test(t), text: "Целевая аудитория 16–25 лет." });
      extra.push({ ok: hasDate(t, b), text: `Дата из вводной — ${b.dateText}.` });
      extra.push({ ok: /(охват|просмотр|зрител|контакт)/.test(low(t)), text: "Ожидаемые результаты: охват, зрители." });
      extra.push({ ok: /(пакет|партн[её]р|получ)/.test(low(t)), text: "Что получит спонсор (пакеты, выгода)." });
      extra.push({ ok: n <= 12, text: n > 12 ? `Слайдов ${n} — для 5 минут защиты многовато.` : "Объём презентации разумный." });
    } else {
      for (const [id, title, w] of [["a3-2", "Не меньше 5 слайдов", 0.5], ["a3-3", "Титульный слайд: название и номер участника", 0.5], ["a3-4", "Слайд со сметой или анализом рисков", 1]] as const)
        aspects.push({ id, title, weight: w, got: x?.kind === "pdf" ? null : 0, note: x?.kind === "pdf" ? pdfNote : x?.kind === "error" ? `Файл не открылся: ${x.message}` : "Нечего проверять — нет .pptx." });
    }
    parts.push({ stage: "pres", title: "3. Презентация", aspects, extra });
  }

  /* --- 4. Заявка --- */
  {
    const f = files.app;
    const x = f?.extract;
    const aspects: Aspect[] = [fileAspect("a4-1", "Файл «Заявка_Уч№…» (.docx/.pdf)", f, "заявка", ["docx", "pdf"])];
    const extra: ReportPart["extra"] = [];
    if (x?.kind === "docx") {
      const empty = emptyFields(x.tables);
      aspects.push({
        id: "a4-2", title: "Все поля заполнены", weight: 0.5, got: x.tables.length && !empty.length ? 0.5 : 0,
        note: !x.tables.length ? "В документе нет таблицы — заявку заполняют в бланке (таблицей)." : empty.length ? `Пустые поля: ${empty.slice(0, 8).map((e) => `«${e}»`).join(", ")}${empty.length > 8 ? ` и ещё ${empty.length - 8}` : ""}.` : "Пустых полей нет.",
      });
      const t = allText(x);
      extra.push({ ok: hasDate(t, b), text: `Дата из вводной — ${b.dateText}.` });
      extra.push({ ok: /(^|\D)8(\D|$)/.test(t), text: "Указано 8 команд." });
    } else {
      aspects.push({ id: "a4-2", title: "Все поля заполнены", weight: 0.5, got: x?.kind === "pdf" ? null : 0, note: x?.kind === "pdf" ? pdfNote : x?.kind === "error" ? `Файл не открылся: ${x.message}` : "Нечего проверять — нет .docx." });
    }
    parts.push({ stage: "app", title: "4. Заявка", aspects, extra });
  }

  /* --- Сверка между файлами: призовой фонд --- */
  const cross: AReport["cross"] = [];
  const prize = (["reg", "pres", "app"] as AStageId[])
    .map((s) => [s, files[s] ? prizeOf(allText(files[s]!.extract)) : null] as const)
    .filter((p) => p[1]);
  const where: Record<string, string> = { reg: "регламенте", pres: "презентации", app: "заявке" };
  if (prize.length >= 2) {
    const same = new Set(prize.map((p) => p[1])).size === 1;
    cross.push({ ok: same, text: same ? `Призовой фонд одинаковый: ${prize[0][1]!.toLocaleString("ru-RU")} ₽.` : "Призовой фонд расходится: " + prize.map((p) => `в ${where[p[0]]} ${p[1]!.toLocaleString("ru-RU")} ₽`).join(", ") + "." });
  } else cross.push({ ok: false, text: "Призовой фонд нашёлся меньше чем в двух файлах — сверить не получилось." });

  return { at: new Date().toISOString(), parts, cross };
}

/** Сумма баллов: автопроверка + самопроверка */
export function reportScore(r: AReport, self: Record<string, boolean>) {
  let got = 0;
  let max = 0;
  let unknown = 0;
  for (const p of r.parts)
    for (const a of p.aspects) {
      max += a.weight;
      const s = A_SELF.find((x) => x.id === a.id);
      if (s) got += self[s.key] ? a.weight : 0;
      else if (a.got === null) unknown += a.weight;
      else got += a.got;
    }
  // Охрана труда и бережливое производство (a5) — тоже измеримые, отмечаются самопроверкой
  for (const s of A_SELF.filter((x) => x.id.startsWith("a5"))) {
    max += s.weight;
    if (self[s.key]) got += s.weight;
  }
  return { got: Math.round(got * 10) / 10, max, unknown };
}

/** Сколько всего баллов в модуле А и сколько из них — судейские (их ставят эксперты) */
export const A_TOTAL = 15;
export const A_JUDGED = 8;

/** Текст для тренера и для Claude: вводная, файлы со ссылками и итог автопроверки */
export function aFourText(w: Record<string, string | boolean>, base = ""): string {
  const b = parseBrief(w.brief);
  if (!b) return "Задание не начато.";
  let r: AReport | null = null;
  try {
    r = JSON.parse(String(w.report || "null"));
  } catch {
    r = null;
  }
  const self = Object.fromEntries(A_SELF.map((s) => [s.key, !!w[s.key]]));
  const lines = [
    "Вводная:",
    ...briefRows(b).map(([k, v]) => `  ${k}: ${v}`),
    "",
    "Файлы:",
    ...A_STAGES.map((s) => {
      const url = String(w[`f_${s.id}`] ?? "");
      return `  ${s.n}. ${s.title}: ${url ? `${String(w[`n_${s.id}`] || "")} — ${url.startsWith("http") ? url : base + url}` : "не сдан"}`;
    }),
  ];
  if (r) {
    const sc = reportScore(r, self);
    lines.push("", `Автопроверка измеряемых аспектов: ${sc.got} из ${sc.max}${sc.unknown ? ` (не проверено ${sc.unknown} — PDF)` : ""}`);
    for (const p of r.parts) {
      lines.push(p.title);
      for (const a of p.aspects) {
        const s = A_SELF.find((x) => x.id === a.id);
        lines.push(`  ${a.id} ${a.title}: ${s ? (self[s.key] ? `${a.weight} (самопроверка)` : "0 (самопроверка)") : a.got === null ? "не проверено" : `${a.got}/${a.weight}`} — ${a.note}`);
      }
      for (const e of p.extra) lines.push(`  ${e.ok ? "✓" : "✗"} ${e.text}`);
    }
    for (const s of A_SELF.filter((x) => x.id.startsWith("a5"))) lines.push(`${s.id} ${s.title}: ${self[s.key] ? s.weight : 0} (самопроверка)`);
    for (const c of r.cross) lines.push(`${c.ok ? "✓" : "✗"} ${c.text}`);
  } else lines.push("", "Автопроверку не запускали.");
  return lines.join("\n");
}
