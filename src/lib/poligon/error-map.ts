/*
 * Карта ошибок: где ученик теряет баллы чаще всего — по всем проверенным попыткам и блицам.
 * Из слабых мест собирается план: какой урок повторить и какой тренажёр пройти.
 */
import { prisma } from "@/lib/db";
import { POLIGON_MODULES } from "@/content/poligon";
import { CRITERIA } from "@/content/poligon/criteria";
import { QUIZ } from "@/content/poligon/quiz";
import { aspectPoints, isModuleCode, parseScores } from "./core";
import type { Lesson, ModuleCode, Variant } from "./types";
import { PC_FAULTS } from "@/content/poligon/pc-faults";
import { scorePcRun } from "./pc-runs";

export type WeakAspect = {
  module: ModuleCode;
  letter: string;
  aspectId: string;
  title: string;
  /** Средняя доля набранного от веса, 0–1 */
  share: number;
  tries: number;
  lessons: Lesson[];
  trainers: Variant[];
};

export type WeakQuestion = { module: ModuleCode; letter: string; q: string; times: number; lesson: Lesson | null };

export async function buildErrorMap(userId: string) {
  const [attempts, quizzes, pcRuns] = await Promise.all([
    prisma.poligonAttempt.findMany({ where: { userId, status: "GRADED" }, orderBy: { createdAt: "desc" } }),
    prisma.poligonQuizResult.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.poligonPcRun.findMany({ where: { userId, done: true }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  // 1. Аспекты критериев: копим доли по всем проверенным попыткам
  const acc = new Map<string, { module: ModuleCode; sum: number; n: number }>();
  for (const a of attempts) {
    if (!isModuleCode(a.moduleCode)) continue;
    const scores = parseScores(a.scores);
    for (const task of CRITERIA[a.moduleCode].tasks) {
      for (const asp of task.aspects) {
        const p = aspectPoints(asp, scores[asp.id]);
        if (p === null || !asp.weight) continue;
        const cur = acc.get(asp.id) ?? { module: a.moduleCode, sum: 0, n: 0 };
        cur.sum += p / asp.weight;
        cur.n += 1;
        acc.set(asp.id, cur);
      }
    }
  }
  const weak: WeakAspect[] = [];
  for (const [aspectId, v] of acc) {
    const share = v.sum / v.n;
    if (share >= 0.7) continue;
    const mod = POLIGON_MODULES.find((m) => m.code === v.module)!;
    const task = CRITERIA[v.module].tasks.find((t) => t.aspects.some((x) => x.id === aspectId))!;
    const asp = task.aspects.find((x) => x.id === aspectId)!;
    weak.push({
      module: v.module,
      letter: mod.letter,
      aspectId,
      title: asp.title,
      share,
      tries: v.n,
      lessons: mod.lessons.filter((l) => l.aspectIds.includes(aspectId)),
      trainers: mod.variants.filter((x) => x.kind === "trainer" && x.taskIds.includes(task.id)),
    });
  }
  weak.sort((a, b) => a.share - b.share);

  // 2. Блиц: вопросы, где ошибался в трёх последних попытках каждого модуля
  const wrongCount = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const r of quizzes) {
    const k = seen.get(r.moduleCode) ?? 0;
    if (k >= 3) continue;
    seen.set(r.moduleCode, k + 1);
    try {
      for (const id of JSON.parse(r.wrongIds) as string[]) wrongCount.set(id, (wrongCount.get(id) ?? 0) + 1);
    } catch {
      // битая запись — пропускаем
    }
  }
  const weakQ: WeakQuestion[] = [];
  for (const mod of POLIGON_MODULES) {
    for (const q of QUIZ[mod.code] ?? []) {
      const times = wrongCount.get(q.id);
      if (!times) continue;
      weakQ.push({ module: mod.code, letter: mod.letter, q: q.q, times, lesson: mod.lessons.find((l) => l.id === q.lessonId) ?? null });
    }
  }
  weakQ.sort((a, b) => b.times - a.times);

  // 3. План: 5 самых слабых мест → урок + тренажёр (без повторов)
  const plan: { module: ModuleCode; text: string; lesson?: Lesson; trainer?: Variant }[] = [];
  const used = new Set<string>();
  for (const w of weak) {
    const lesson = w.lessons.find((l) => !used.has(l.id));
    const trainer = w.trainers.find((t) => !used.has(t.id));
    if (!lesson && !trainer) continue;
    if (lesson) used.add(lesson.id);
    if (trainer) used.add(trainer.id);
    plan.push({ module: w.module, text: `Модуль ${w.letter}: ${w.title} — набрано ${Math.round(w.share * 100)}%`, lesson, trainer });
    if (plan.length >= 5) break;
  }
  for (const q of weakQ) {
    if (plan.length >= 7) break;
    if (!q.lesson || used.has(q.lesson.id)) continue;
    used.add(q.lesson.id);
    plan.push({ module: q.module, text: `Модуль ${q.letter}, блиц: «${q.q}»`, lesson: q.lesson });
  }

  // 4. Практика на ПК: неисправности, где не уложился в норму или нужны были подсказки
  const weakPc = pcRuns
    .map((r) => ({ run: r, score: scorePcRun(r), fault: PC_FAULTS.find((f) => f.id === r.faultId) }))
    .filter((x) => x.score.notes.length > 0)
    .map((x) => ({ title: x.fault?.title ?? x.run.faultId, category: x.fault?.category ?? "", notes: x.score.notes }));
  const simTrainer = POLIGON_MODULES.find((m) => m.code === "v")?.variants.find((v) => v.id === "v-tr-sim");
  if (weakPc.length && simTrainer && !used.has(simTrainer.id) && plan.length < 7) {
    plan.push({ module: "v", text: `Модуль В, практика на ПК: ${weakPc[0].title} — ${weakPc[0].notes[0].toLowerCase()}`, trainer: simTrainer });
  }

  return { weak, weakQ, weakPc, plan, graded: attempts.length, quizzes: quizzes.length, pcRuns: pcRuns.length };
}
