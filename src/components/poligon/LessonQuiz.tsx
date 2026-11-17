"use client";

import { useSyncExternalStore } from "react";

const memory = new Map<string, string>();
function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener("poligon-lesson-answer", notify);
  return () => { window.removeEventListener("storage", notify); window.removeEventListener("poligon-lesson-answer", notify); };
}

/** Маленькая самопроверка урока: ответ остаётся в этом браузере, баллы не начисляются. */
export function LessonQuiz({ id, question, options, correct, feedback }: {
  id: string; question: string; options: string[]; correct: number; feedback: string;
}) {
  const key = `poligon:lesson:${id}`;
  const raw = useSyncExternalStore(subscribe, () => {
    try { return localStorage.getItem(key) || memory.get(key) || ""; } catch { return memory.get(key) || ""; }
  }, () => "");
  let answer: number | null = null, checked = false;
  try {
    const saved = JSON.parse(raw);
    if (Number.isInteger(saved?.answer) && saved.answer >= 0 && saved.answer < options.length) {
      answer = saved.answer; checked = saved.checked === true;
    }
  } catch { /* Повреждённый локальный ответ можно выбрать заново. */ }
  function save(value: number | null, done: boolean) {
    const next = JSON.stringify({ answer: value, checked: done });
    memory.set(key, next);
    try { localStorage.setItem(key, next); } catch { /* Без хранилища ответ действует до закрытия страницы. */ }
    window.dispatchEvent(new Event("poligon-lesson-answer"));
  }
  return <fieldset className="rounded-[var(--radius-control)] border border-[var(--points-border)] bg-[var(--points-bg)] p-4">
    <legend className="px-1 font-semibold text-[var(--points-ink)]">Проверь решение</legend>
    <p className="mb-3 font-medium text-[var(--text)]">{question}</p>
    <div className="flex flex-col gap-2">{options.map((option, i) => <label key={i} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
      <input type="radio" name={`quiz-${id}`} checked={answer === i} onChange={() => save(i, false)} className="mt-1" />{option}
    </label>)}</div>
    <button type="button" disabled={answer === null} onClick={() => save(answer, true)} className="mt-3 min-h-11 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-4 py-2 font-medium disabled:opacity-50">Проверить ответ</button>
    {checked && <p role="status" className="mt-3"><strong>{answer === correct ? "Верно. " : "Попробуй ещё раз. "}</strong>{feedback}</p>}
    <p className="mt-2 text-xs text-[var(--text-2)]">Это учебная самопроверка. Ответ сохраняется только в этом браузере и не заменяет сдачу файла.</p>
  </fieldset>;
}
