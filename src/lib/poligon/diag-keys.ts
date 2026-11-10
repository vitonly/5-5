/*
 * Ключи и автопроверка входной диагностики. Только для сервера:
 * этот файл импортируют лишь API и страницы тренера, поэтому ответы не попадают в браузер ученика.
 */
import { DIAG_SECTIONS, type DiagAnswers, type DiagItem } from "@/content/poligon/diag";

/** Правильные ответы: номер варианта, список номеров или допустимые короткие ответы */
const KEYS: Record<string, number | number[] | string[]> = {
  // Модуль А
  a1: 1, a2: 1, a3: 1, a4: 1, a5: 1, a6: [0, 2, 3, 4, 5], a10: 0,
  // Модуль Б: 4 уникальных матча (M02 повторяется), самый длинный — M04 (52:10; M03 — это 49:10)
  b1: [0, 1, 2, 3, 4, 5], b2: ["4", "четыре"], b3: ["m04", "м04"],
  b5: 1, b6: 1, b7: 1, b8: 1, b9: 1,
  // Модуль В
  c1: 1, c2: 0, c3: 1, c4: 0, c5: 0, c6: [0, 1, 2, 4], c7: 1, c8: 1, c11: 1, c12: 1,
  // Охрана труда
  d1: 1, d2: 1, d3: 1, d4: 1,
  // Модуль Г
  e1: 1, e2: 1, e3: 0, e4: 1, e8: 1,
  // Модуль Д
  f1: 1, f2: 1, f5: 1,
};

/** Итог по одному вопросу: балл 0..1 (частично — для «несколько вариантов») или null, если проверяет человек */
export type DiagMark = { id: string; score: number | null };
export type DiagSectionScore = { code: string; title: string; got: number; max: number; manual: number };

/** Привести короткий ответ к виду для сравнения: без пробелов, регистра и кавычек */
function norm(s: string) {
  return s.toLowerCase().replace(/[\s"«»'.]/g, "");
}

/** Проверить один вопрос */
export function markItem(item: DiagItem, v: unknown): DiagMark {
  const key = KEYS[item.id];
  if (key === undefined) return { id: item.id, score: null }; // развёрнутый ответ или самооценка
  if (item.t === "single") return { id: item.id, score: v === key ? 1 : 0 };
  if (item.t === "multi" && Array.isArray(key)) {
    // За каждый верный +1, за каждый лишний −1, делим на число верных; ниже нуля не уходим
    const picked = Array.isArray(v) ? (v as number[]) : [];
    const right = key as number[];
    const hits = picked.filter((x) => right.includes(x)).length;
    const extra = picked.length - hits;
    return { id: item.id, score: Math.max(0, (hits - extra) / right.length) };
  }
  if (item.t === "short") {
    const ok = typeof v === "string" && (key as string[]).some((k) => norm(v) === norm(k));
    return { id: item.id, score: ok ? 1 : 0 };
  }
  return { id: item.id, score: null };
}

/** Проверить всю диагностику: оценки по вопросам и итоги по разделам */
export function scoreDiag(answers: DiagAnswers) {
  const marks: Record<string, number | null> = {};
  const sections: DiagSectionScore[] = [];
  for (const s of DIAG_SECTIONS) {
    let got = 0;
    let max = 0;
    let manual = 0;
    for (const it of s.items) {
      if (it.t === "table" || it.t === "scale") continue;
      const m = markItem(it, answers[it.id]);
      marks[it.id] = m.score;
      if (m.score === null) manual++;
      else {
        got += m.score;
        max++;
      }
    }
    if (max || manual) sections.push({ code: s.code, title: s.title, got: Math.round(got * 10) / 10, max, manual });
  }
  return { marks, sections };
}

/** Текст правильного ответа — для выгрузки тренеру */
function keyText(item: DiagItem): string {
  const key = KEYS[item.id];
  if (key === undefined) return "";
  if (item.t === "single") return item.opts[key as number];
  if (item.t === "multi") return (key as number[]).map((i) => item.opts[i]).join("; ");
  return (key as string[])[0];
}

/** Выгрузка для Claude: все вопросы, ответы ученика, автооценка и ключи — одним текстом */
export function diagExportText(name: string, answers: DiagAnswers, minutes: number | null) {
  const { marks, sections } = scoreDiag(answers);
  const lines: string[] = [
    `ВХОДНАЯ ДИАГНОСТИКА «Профессионалы» · ${name}`,
    minutes != null ? `Время: ${minutes} мин` : "",
    "",
    "Автопроверка по разделам: " + sections.filter((s) => s.max).map((s) => `${s.code} ${s.got}/${s.max}`).join(" · "),
    "Развёрнутые ответы (помечены [ПРОВЕРИТЬ]) оцени по шкале 0–2 и собери план подготовки по слабым местам.",
  ];
  let n = 0;
  for (const s of DIAG_SECTIONS) {
    lines.push("", `== ${s.code} ${s.title} ==`);
    for (const it of s.items) {
      if (it.t === "table") {
        lines.push(`[Таблица] ${it.head.join(" | ")}`, ...it.rows.map((r) => "  " + r.join(" | ")));
        continue;
      }
      n++;
      const v = answers[it.id];
      let a = "— (нет ответа)";
      if (it.t === "single" && typeof v === "number") a = it.opts[v];
      else if (it.t === "multi" && Array.isArray(v) && v.length) a = v.map((i) => it.opts[i]).join("; ");
      else if (it.t === "scale" && v && typeof v === "object" && !Array.isArray(v))
        a = it.rows.map(([k, label]) => `${label}: ${(v as Record<string, number>)[k] ?? "—"}`).join("\n     ");
      else if (typeof v === "string" && v.trim()) a = v.trim();
      const m = marks[it.id];
      const tag = m == null ? (it.t === "scale" ? "" : " [ПРОВЕРИТЬ]") : m === 1 ? " [верно]" : m === 0 ? ` [неверно; ключ: ${keyText(it)}]` : ` [частично ${Math.round(m * 100)}%; ключ: ${keyText(it)}]`;
      lines.push(`${n}. (${it.id}) ${it.q}${tag}`, `   → ${a}`);
    }
  }
  return lines.filter((l, i) => l !== "" || i > 1).join("\n");
}
