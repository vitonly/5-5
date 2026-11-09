/*
 * Полигон — общая логика: поиск модулей и вариантов, доступ, подсчёт баллов, рекомендации.
 * Эти функции не трогают браузер, их можно звать и на сервере, и в клиентских компонентах.
 */
import { CRITERIA } from "@/content/poligon/criteria";
import { POLIGON_MODULES } from "@/content/poligon";
import type { CriteriaAspect, CriteriaTask, Lesson, ModuleCode, PoligonModule, Variant } from "./types";

export const MODULE_CODES: ModuleCode[] = ["a", "b", "v", "g", "d"];

/** Сколько минут после окончания времени ещё принимаем сдачу в режиме чемпионата (на загрузку файлов) */
export const CHAMPIONSHIP_GRACE_MIN = 3;

export function isModuleCode(value: string): value is ModuleCode {
  return (MODULE_CODES as string[]).includes(value);
}

export function getModule(code: string): PoligonModule | null {
  return POLIGON_MODULES.find((m) => m.code === code) ?? null;
}

export function getLesson(module: PoligonModule, lessonId: string): Lesson | null {
  return module.lessons.find((l) => l.id === lessonId) ?? null;
}

export function getVariant(module: PoligonModule, variantId: string): Variant | null {
  return module.variants.find((v) => v.id === variantId) ?? null;
}

/** Задания критериев, по которым оценивается вариант */
export function variantTasks(moduleCode: ModuleCode, variant: Variant): CriteriaTask[] {
  return CRITERIA[moduleCode].tasks.filter((t) => variant.taskIds.includes(t.id));
}

/** Максимум баллов по списку заданий */
export function maxPoints(tasks: CriteriaTask[]): number {
  return round2(tasks.reduce((s, t) => s + t.aspects.reduce((a, x) => a + x.weight, 0), 0));
}

/** Может ли пользователь открыть полигон: тренер — всегда, ученик — если тренер включил доступ */
export function canUsePoligon(user: { role: string; poligonAccess?: boolean | null }): boolean {
  return user.role === "ADMIN" || user.poligonAccess === true;
}

/* ---------- Баллы ---------- */

/** Оценка одного аспекта, как её хранит база */
export type AspectScore = { value: number | null; comment: string };
export type ScoresMap = Record<string, AspectScore>;

export function parseScores(raw: string | null | undefined): ScoresMap {
  try {
    const data = JSON.parse(raw || "{}");
    return data && typeof data === "object" ? (data as ScoresMap) : {};
  } catch {
    return {};
  }
}

/**
 * Баллы за аспект.
 * Измеримый: тренер ставит баллы сам (от 0 до веса).
 * Судейский: оценка 0–3 переводится в баллы как вес × оценка / 3
 * (стандартный пересчёт чемпионатов; в документах компетенции формула прямо не прописана).
 */
export function aspectPoints(aspect: CriteriaAspect, score: AspectScore | undefined): number | null {
  if (!score || score.value === null || score.value === undefined || Number.isNaN(score.value)) return null;
  if (aspect.type === "I") return round2(Math.min(Math.max(score.value, 0), aspect.weight));
  const grade = Math.min(Math.max(Math.round(score.value), 0), 3);
  return round2((aspect.weight * grade) / 3);
}

export type TaskResult = {
  task: CriteriaTask;
  points: number;
  max: number;
  /** Сколько аспектов ещё без оценки */
  ungraded: number;
};

export function taskResults(tasks: CriteriaTask[], scores: ScoresMap): TaskResult[] {
  return tasks.map((task) => {
    let points = 0;
    let max = 0;
    let ungraded = 0;
    for (const a of task.aspects) {
      max += a.weight;
      const p = aspectPoints(a, scores[a.id]);
      if (p === null) ungraded++;
      else points += p;
    }
    return { task, points: round2(points), max: round2(max), ungraded };
  });
}

export function totalOf(results: TaskResult[]) {
  return {
    points: round2(results.reduce((s, r) => s + r.points, 0)),
    max: round2(results.reduce((s, r) => s + r.max, 0)),
  };
}

/**
 * Рекомендации «на что сделать упор»: уроки, связанные с аспектами,
 * где набрано меньше 70% веса. Самые проблемные — первыми.
 */
export function recommendLessons(module: PoligonModule, tasks: CriteriaTask[], scores: ScoresMap): Lesson[] {
  const weak: { id: string; share: number }[] = [];
  for (const t of tasks) {
    for (const a of t.aspects) {
      const p = aspectPoints(a, scores[a.id]);
      if (p === null) continue;
      const share = a.weight > 0 ? p / a.weight : 1;
      if (share < 0.7) weak.push({ id: a.id, share });
    }
  }
  weak.sort((x, y) => x.share - y.share);
  const picked: Lesson[] = [];
  for (const w of weak) {
    for (const lesson of module.lessons) {
      if (lesson.aspectIds.includes(w.id) && !picked.includes(lesson)) picked.push(lesson);
    }
  }
  return picked;
}

/* ---------- Файлы попытки ---------- */

export type AttemptFile = { name: string; url: string };

export function parseFiles(raw: string | null | undefined): AttemptFile[] {
  try {
    const data = JSON.parse(raw || "[]");
    if (!Array.isArray(data)) return [];
    return data.filter(
      (f): f is AttemptFile => !!f && typeof f.name === "string" && typeof f.url === "string"
    );
  } catch {
    return [];
  }
}

/* ---------- Мелочи ---------- */

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** 7.5 → «7,5» — как принято писать баллы по-русски */
export function fmtPoints(n: number) {
  return String(round2(n)).replace(".", ",");
}

/** 125 минут → «2 ч 05 мин» */
export function fmtMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} мин`;
  return m ? `${h} ч ${String(m).padStart(2, "0")} мин` : `${h} ч`;
}

export const MODE_LABEL: Record<string, string> = {
  PRACTICE: "Тренировка",
  CHAMPIONSHIP: "Как на чемпионате",
};

export const STATUS_LABEL: Record<string, string> = {
  IN_PROGRESS: "Идёт",
  SUBMITTED: "Сдано, ждёт проверки",
  GRADED: "Проверено",
};
