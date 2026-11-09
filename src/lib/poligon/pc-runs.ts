/*
 * Практика на ПК: баллы по времени — как в критериях модуля В.
 * Найдена за 20 минут — 1; устранена — 0,5; устранена быстрее 10 минут после обнаружения — 0,5;
 * утилиты использованы — 2; самостоятельность — без подсказок.
 */
import type { PoligonPcRun } from "@prisma/client";

export type PcScore = {
  findMin: number | null;
  fixMin: number | null;
  points: number;
  max: number;
  notes: string[];
};

const minutes = (a: Date, b: Date) => Math.round(((b.getTime() - a.getTime()) / 60000) * 10) / 10;

export function scorePcRun(run: PoligonPcRun): PcScore {
  const notes: string[] = [];
  let points = 0;
  const findMin = run.foundAt ? minutes(run.startedAt, run.foundAt) : null;
  const fixMin = run.fixedAt && run.foundAt ? minutes(run.foundAt, run.fixedAt) : null;
  if (findMin !== null && findMin <= 20) points += 1;
  else notes.push(findMin === null ? "Неисправность не найдена" : `Поиск ${findMin} мин — больше 20`);
  if (run.fixedAt) points += 0.5;
  else notes.push("Не устранена");
  if (fixMin !== null && fixMin < 10) points += 0.5;
  else if (fixMin !== null) notes.push(`Устранение ${fixMin} мин — не меньше 10`);
  let utils: string[] = [];
  try {
    utils = JSON.parse(run.utilities);
  } catch {
    utils = [];
  }
  if (utils.length) points += 2;
  else notes.push("Не использовал диагностические утилиты");
  if (run.hints) notes.push(`Подсказок: ${run.hints} — минус к «самостоятельности»`);
  return { findMin, fixMin, points, max: 4, notes };
}
