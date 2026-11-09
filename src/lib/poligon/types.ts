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
  | { type: "exercise"; title: string; task: string; answer: string };

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
  /** practice — тренировочное задание (мягкий таймер), championship — прогон как на чемпионате */
  kind: "practice" | "championship";
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
