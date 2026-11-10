/*
 * Полигон «Профессионалы» — типы контента.
 * Весь учебный контент (уроки, варианты заданий, критерии) хранится файлами в src/content/poligon,
 * а попытки учеников и оценки — в базе (модели PoligonAttempt, PoligonLessonDone, PoligonVariantFile).
 */

/** Код модуля: а, б, в, г, д латиницей (так удобнее в адресах страниц) */
export type ModuleCode = "a" | "b" | "v" | "g" | "d";

/** Режим попытки: тренировка (мягкий таймер) или прогон «как на чемпионате» (жёсткий таймер) */
export type AttemptMode = "PRACTICE" | "CHAMPIONSHIP";

/** Статус попытки */
export type AttemptStatus = "IN_PROGRESS" | "SUBMITTED" | "GRADED";

/* ---------- Критерии оценки ---------- */

/** Аспект оценки: I — измеримый (да/нет, баллы), S — судейский (оценка эксперта 0–3) */
export type CriteriaAspect = {
  id: string;
  type: "I" | "S";
  title: string;
  /** Как эксперт проверяет */
  method: string;
  /** Вес аспекта в баллах */
  weight: number;
  /** Описания оценок 0, 1, 2, 3 — только для судейских */
  levels?: string[];
};

/** Задание (субкритерий) — группа аспектов */
export type CriteriaTask = {
  id: string;
  title: string;
  aspects: CriteriaAspect[];
};

export type CriteriaModule = {
  title: string;
  tasks: CriteriaTask[];
};

/* ---------- Блоки текста уроков ---------- */

/**
 * Урок собирается из простых блоков: так не нужен разборщик Markdown,
 * а текст остаётся обычными строками. В строках можно выделять **жирным**.
 */
export type Block =
  | { type: "p"; text: string }
  | { type: "h"; text: string }
  | { type: "list"; items: string[]; ordered?: boolean }
  | { type: "table"; head: string[]; rows: string[][] }
  /** Плашка: points — «за это дают баллы», tip — совет, warn — ловушка */
  | { type: "callout"; tone: "points" | "tip" | "warn"; title?: string; text: string }
  /** Формула Excel или фрагмент кода — моноширинным шрифтом, с кнопкой копирования */
  | { type: "code"; text: string; caption?: string }
  /** Упражнение со скрытым ответом */
  | { type: "exercise"; title: string; task: string; answer: string }
  /** Схема окна Excel: вкладка, кнопка, строка формул, ячейки с пометками, окно-диалог */
  | ({ type: "excel" } & ExcelFigure)
  /** Схема страницы Word: строки со стилями */
  | { type: "word"; caption?: string; ribbon?: string; active?: string; lines: { style: "title" | "h1" | "h2" | "p" | "li"; text: string }[] }
  /** Схема слайдов: «плохо» и «хорошо» рядом */
  | { type: "slides"; caption?: string; items: SlideFigure[] }
  /** Схема окна Windows: заголовок, путь, список строк со значками, кнопки */
  | ({ type: "win" } & WinFigure)
  /** Окно командной строки: команда и вывод */
  | { type: "console"; caption?: string; lines: string[] }
  /** Рисунки разъёмов с подписями */
  | { type: "connectors"; caption?: string; items: ConnectorId[] };

export type ConnectorId = "hdmi" | "dp" | "vga" | "dvi" | "usba" | "usbc" | "rj45" | "jack-green" | "jack-pink" | "c13" | "atx24" | "eps8" | "pcie8" | "sata";

export type WinFigure = {
  caption?: string;
  /** Заголовок окна: «Диспетчер устройств», «Параметры» */
  title: string;
  /** Путь вверху (для «Параметров»): «Система › Звук» */
  path?: string;
  /** Строки окна; icon: warn — жёлтый треугольник, off — стрелка вниз (отключено), ok — галочка */
  items: { text: string; icon?: "warn" | "off" | "ok" | "folder"; indent?: number; mark?: "sel" | "bad" }[];
  /** Кнопки внизу; active — какую нажать */
  buttons?: string[];
  active?: string;
};

/** Пометка ячейки: bad — ошибка в данных, ok — правильно, sel — выделено */
export type CellMark = "bad" | "ok" | "sel";

export type ExcelFigure = {
  caption?: string;
  /** Активная вкладка ленты: «Главная», «Вставка», «Данные»… */
  tab?: string;
  /** Кнопки на ленте; active — та, которую надо нажать */
  ribbon?: string[];
  active?: string;
  /** Строка формул: адрес ячейки и формула */
  cell?: string;
  formula?: string;
  /** Буквы столбцов (по умолчанию A, B, C…) и строки таблицы */
  cols?: string[];
  rows: string[][];
  /** Номер первой строки (по умолчанию 1) */
  firstRow?: number;
  /** Пометки ячеек: ключ «строка,столбец» от 0 */
  marks?: Record<string, CellMark>;
  /** Окно-диалог поверх: заголовок, строки, кнопка */
  dialog?: { title: string; lines: string[]; button?: string };
};

export type SlideFigure = {
  label: string;
  tone: "bad" | "good";
  title: string;
  /** Пункты текста или крупные числа */
  bullets?: string[];
  big?: { value: string; label: string }[];
  /** Схема диаграммы: подписи и высоты 0–100 */
  bars?: { label: string; value: number }[];
};

/**
 * Тренажёры:
 * a-practicum — весь модуль А; a-reg, a-grid, a-pres, a-app — по одному продукту А;
 * b-clean — очистка данных, b-calc — ключевые цифры, b-charts — диаграммы и выводы, b-pres — презентация и рекомендации;
 * v-sim — симулятор неисправностей, v-cmd — командная строка, v-where — пути в Windows и разъёмы, v-docs — акт и отчёт.
 */
export type WorkbookId =
  | "a-practicum" | "a-reg" | "a-grid" | "a-pres" | "a-app"
  | "b-clean" | "b-calc" | "b-charts" | "b-pres"
  | "v-sim" | "v-cmd" | "v-where" | "v-docs";

export type Lesson = {
  id: string;
  title: string;
  /** Сколько минут занимает урок */
  minutes: number;
  /** Коротко, о чём урок — для списка */
  summary: string;
  blocks: Block[];
  /** К каким аспектам критериев относится урок — по ним строятся рекомендации после попытки */
  aspectIds: string[];
};

/** Что ученик сдаёт в попытке */
export type Deliverable = {
  /** Как назвать файл, например «Аналитический_отчёт_Уч№» */
  name: string;
  /** Допустимые форматы, например ".xlsx, .pdf" */
  formats: string;
};

export type Variant = {
  id: string;
  title: string;
  /**
   * trainer — тренажёр в «Подготовке» (пишет всё на сайте, мягкий таймер),
   * practice — тренировочное задание с файлами (мягкий таймер),
   * championship — прогон как на чемпионате (жёсткий таймер)
   */
  kind: "trainer" | "practice" | "championship";
  minutes: number;
  summary: string;
  /** Текст задания */
  brief: Block[];
  /**
   * Исходные файлы варианта (датасет, бланки).
   * builtinUrl — файл уже лежит на сайте (наши учебные данные).
   * Без него — тренер прикладывает файл сам в админке (материалы чемпионата в открытый git не кладём).
   */
  sourceFiles: { label: string; builtinUrl?: string }[];
  deliverables: Deliverable[];
  /** По каким заданиям критериев оценивается попытка (id из CRITERIA) */
  taskIds: string[];
  /** Тетрадь-тренажёр: ученик заполняет всё прямо на сайте, а разбор появляется сразу */
  workbook?: WorkbookId;
};

export type PoligonModule = {
  code: ModuleCode;
  /** Буква модуля на чемпионате */
  letter: string;
  title: string;
  /** Длительность на чемпионате */
  hours: number;
  maxPoints: number;
  /** Что за роль и что делает конкурсант — 1–2 предложения */
  about: string;
  /** Короткие правила модуля на чемпионате: ИИ, интернет, папки */
  rules: string[];
  /** Готов ли контент модуля (если нет — показываем «скоро») */
  ready: boolean;
  lessons: Lesson[];
  variants: Variant[];
};
