"use client";

/*
 * Тренажёры модуля Б. Excel на сайте не повторить, поэтому:
 * очистка — определить ловушку в каждой строке; цифры — посчитать в Excel и вписать сюда;
 * диаграммы — выбрать тип и написать заголовок-вывод; презентация — 5 слайдов и 3 рекомендации.
 * Проверка — сразу, кнопкой «Показать разбор».
 */
import { useEffect, useRef, useState } from "react";
import type { ReviewCard, Workbook } from "@/lib/poligon/a-practicum";
import {
  CALC_FIELDS,
  CHART_QUESTIONS,
  CHART_TYPES,
  CLEAN_KINDS,
  CLEAN_ROWS,
  PRES_SLIDES,
  RECS,
  reviewB,
} from "@/lib/poligon/b-trainers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ReviewList } from "./APracticum";

const field = "flex flex-col gap-1 text-[14px] text-[var(--text-2)]";
const box = "flex flex-col gap-2 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-muted)] p-3";
const select = "h-9 rounded-[var(--radius-control)] border border-[var(--border-field)] bg-[var(--surface)] px-2 text-[14px] text-[var(--text)]";
const DATASET = "/poligon/files/b-osenniy-kubok.xlsx";

export function BTrainer({
  id,
  initial,
  readOnly = false,
  onChange,
}: {
  id: "b-clean" | "b-calc" | "b-charts" | "b-pres";
  initial: Workbook;
  readOnly?: boolean;
  onChange?: (w: Workbook) => void;
}) {
  const [w, setW] = useState<Workbook>(initial);
  const [review, setReview] = useState<ReviewCard[] | null>(readOnly ? reviewB(id, initial) : null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    onChange?.(w);
  }, [w, onChange]);
  const s = (k: string) => String(w[k] ?? "");
  const set = (k: string, v: string) => setW((o) => ({ ...o, [k]: v }));

  return (
    <div className="flex flex-col gap-5">
      {(id === "b-clean" || id === "b-calc") && (
        <p className="text-[14px] text-[var(--text-2)]">
          Учебный датасет:{" "}
          <a className="font-medium text-[var(--points-ink)] underline" href={DATASET} download>
            «Осенний кубок СТАРТ+» (.xlsx)
          </a>
        </p>
      )}

      {id === "b-clean" && (
        <>
          <section className="surface-card flex flex-col gap-3 p-4">
            <h2 className="text-[18px]">Что не так в строке?</h2>
            <p className="text-[14px] text-[var(--text-2)]">Строки взяты из датасета. Для каждой выбери, есть ли ловушка и какая. Значок ␣ — лишний пробел.</p>
            {CLEAN_ROWS.map((r) => (
              <div key={r.id} className={box}>
                <span className="font-mono text-[12px] text-[var(--text-3)]">Лист «{r.sheet}»</span>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] border-collapse font-mono text-[13px]">
                    <tbody>
                      <tr>
                        {r.cells.map((c, i) => (
                          <td key={i} className="border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1 text-[var(--text)]">
                            {c}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
                <select className={select} value={s(r.id)} onChange={(e) => set(r.id, e.target.value)} disabled={readOnly} aria-label={`Строка ${r.cells[0]}`}>
                  <option value="">— выбери —</option>
                  {CLEAN_KINDS.map((k) => (
                    <option key={k.v} value={k.v}>
                      {k.t}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </section>
          <section className="surface-card flex flex-col gap-3 p-4">
            <h2 className="text-[18px]">Очисти весь датасет в Excel и ответь</h2>
            <div className="grid gap-2 min-[640px]:grid-cols-3">
              {[
                ["n_teams", "Уникальных команд"],
                ["n_matches", "Уникальных матчей"],
                ["n_inc", "Уникальных инцидентов"],
              ].map(([k, l]) => (
                <label key={k} className={field}>
                  {l}
                  <Input value={s(k)} onChange={(e) => set(k, e.target.value)} disabled={readOnly} inputMode="numeric" />
                </label>
              ))}
            </div>
            <label className={field}>
              Журнал очистки: что нашёл, где, что сделал (по строке на ловушку)
              <Textarea rows={6} value={s("log")} onChange={(e) => set("log", e.target.value)} disabled={readOnly} />
            </label>
          </section>
        </>
      )}

      {id === "b-calc" && (
        <section className="surface-card flex flex-col gap-3 p-4">
          <h2 className="text-[18px]">Посчитай в Excel и впиши результат</h2>
          <p className="text-[14px] text-[var(--text-2)]">Сначала очисти данные (дубли, форматы), потом считай формулами и сводными. Ответ — только число или ID.</p>
          <div className="grid gap-2 min-[640px]:grid-cols-2">
            {CALC_FIELDS.map((f) => (
              <label key={f.id} className={field}>
                {f.label}
                <Input value={s(f.id)} onChange={(e) => set(f.id, e.target.value)} disabled={readOnly} />
              </label>
            ))}
          </div>
          <label className={field}>
            Какой формулой посчитал сетевые инциденты?
            <Input className="font-mono" value={s("k_formula")} onChange={(e) => set("k_formula", e.target.value)} disabled={readOnly} />
          </label>
        </section>
      )}

      {id === "b-charts" && (
        <section className="surface-card flex flex-col gap-3 p-4">
          <h2 className="text-[18px]">Тип диаграммы и заголовок-вывод</h2>
          <p className="text-[14px] text-[var(--text-2)]">Для каждого вопроса отчёта выбери тип диаграммы и напиши заголовок, который говорит вывод с цифрой (данные — из учебного датасета).</p>
          {CHART_QUESTIONS.map((q) => (
            <div key={q.id} className={box}>
              <p className="text-[15px] font-semibold text-[var(--text)]">{q.q}</p>
              <select className={select} value={s(`${q.id}t`)} onChange={(e) => set(`${q.id}t`, e.target.value)} disabled={readOnly} aria-label={`Тип: ${q.q}`}>
                <option value="">— тип диаграммы —</option>
                {CHART_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <Input placeholder="Заголовок-вывод, например «После 17:00 — 8 из 10 сбоев»" value={s(`${q.id}h`)} onChange={(e) => set(`${q.id}h`, e.target.value)} disabled={readOnly} />
            </div>
          ))}
        </section>
      )}

      {id === "b-pres" && (
        <>
          <section className="surface-card flex flex-col gap-3 p-4">
            <h2 className="text-[18px]">5 слайдов — не больше</h2>
            {PRES_SLIDES.map((sl) => (
              <div key={sl.id} className={box}>
                <h3 className="text-[16px] font-semibold text-[var(--text)]">{sl.t}</h3>
                <p className="text-[13px] text-[var(--text-3)]">{sl.hint}</p>
                <Input placeholder="Заголовок слайда" value={s(`${sl.id}h`)} onChange={(e) => set(`${sl.id}h`, e.target.value)} disabled={readOnly} />
                <Textarea rows={3} value={s(`${sl.id}b`)} onChange={(e) => set(`${sl.id}b`, e.target.value)} disabled={readOnly} />
              </div>
            ))}
          </section>
          <section className="surface-card flex flex-col gap-3 p-4">
            <h2 className="text-[18px]">Рекомендации организаторам</h2>
            <p className="text-[14px] text-[var(--text-2)]">Схема: проблема (с цифрой из отчёта) → действие → ожидаемый результат.</p>
            {RECS.map((r) => (
              <div key={r.id} className={box}>
                <h3 className="text-[16px] font-semibold text-[var(--text)]">{r.t}</h3>
                {[
                  ["p", "Проблема (с цифрой)"],
                  ["a", "Действие"],
                  ["e", "Ожидаемый результат"],
                ].map(([k, l]) => (
                  <label key={k} className={field}>
                    {l}
                    <Input value={s(`${r.id}${k}`)} onChange={(e) => set(`${r.id}${k}`, e.target.value)} disabled={readOnly} />
                  </label>
                ))}
              </div>
            ))}
          </section>
        </>
      )}

      <section className="surface-card flex flex-col gap-3 p-4">
        <h2 className="text-[18px]">Разбор</h2>
        <div>
          <Button onClick={() => setReview(reviewB(id, w))}>{review ? "Обновить разбор" : "Показать разбор"}</Button>
        </div>
        {review && <ReviewList cards={review} />}
      </section>
    </div>
  );
}
