/*
 * Все модули полигона по порядку чемпионата.
 * Модули с ready: false показываются как «скоро» — контент для них добавим следующими.
 */
import type { PoligonModule } from "@/lib/poligon/types";
import { MODULE_A } from "./a";
import { MODULE_B } from "./b";
import { MODULE_V } from "./v";

const soon = (m: Omit<PoligonModule, "ready" | "lessons" | "variants">): PoligonModule => ({
  ...m,
  ready: false,
  lessons: [],
  variants: [],
});

export const POLIGON_MODULES: PoligonModule[] = [
  MODULE_A,
  MODULE_B,
  MODULE_V,
  soon({
    code: "g",
    letter: "Г",
    title: "Медиа и коммуникации",
    hours: 4,
    maxPoints: 20,
    about: "Ты — медиаменеджер: пост-анонс, пресс-релиз, видеообзор с голосом и топ-5 моментов.",
    rules: ["Время — 4 часа.", "ИИ можно (с указанием, где использован)."],
  }),
  soon({
    code: "d",
    letter: "Д",
    title: "Комплексный проект",
    hours: 3,
    maxPoints: 25,
    about: "Собираешь всё вместе в концепцию киберспортивного продукта и защищаешь её перед экспертами.",
    rules: ["Время — 3 часа.", "ИИ можно для визуальных материалов."],
  }),
];
