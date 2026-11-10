"use client";

/*
 * Тетрадь-практикум модуля А.
 * Ученик пишет регламент, строит сетку, собирает слайды со сметой и заполняет заявку прямо здесь.
 * Кнопка «Показать разбор» сразу проверяет работу по критериям и сверяет цифры между файлами.
 * readOnly — так тетрадь видит тренер (и ученик после сдачи).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  A_BRIEF,
  A_FORM,
  A_MATCHES,
  A_REG,
  A_SLIDES,
  A_SMETA,
  A_BRAND,
  A_FORM_HINTS,
  A_PACKS,
  A_REACH,
  reachSum,
  A_ALL_PARTS,
  reviewWorkbook,
  sideName,
  smetaSum,
  winnerName,
  workbookText,
  type APart,
  type ReviewCard,
  type Workbook,
} from "@/lib/poligon/a-practicum";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const field = "flex flex-col gap-1 text-[14px] text-[var(--text-2)]";
const box =
  "flex flex-col gap-2 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-muted)] p-3";

export function APracticum({
  initial,
  readOnly = false,
  onChange,
  parts = A_ALL_PARTS,
}: {
  initial: Workbook;
  readOnly?: boolean;
  /** Какие части показывать: весь модуль или один продукт (тренажёр) */
  parts?: APart[];
  /** Вызывается при каждом изменении (сохранение делает родитель) */
  onChange?: (w: Workbook) => void;
}) {
  const [w, setW] = useState<Workbook>(initial);
  const [review, setReview] = useState<ReviewCard[] | null>(
    readOnly ? reviewWorkbook(initial, parts) : null,
  );
  const has = (p: APart) => parts.includes(p);
  const first = useRef(true);

  // Сообщаем родителю об изменениях (кроме самого первого рендера)
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    onChange?.(w);
  }, [w, onChange]);

  const s = (id: string) => String(w[id] ?? "");
  const set = (id: string, v: string | boolean) =>
    setW((old) => ({ ...old, [id]: v }));
  const total = useMemo(() => smetaSum(w), [w]);

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(workbookText(w));
      toast.success("Скопировано — вставь в Word");
    } catch {
      toast.error("Не получилось скопировать");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Вводная */}
      <section className="surface-card flex flex-col gap-3 p-4">
        <h2 className="text-[18px]">Вводная — как на брифинге</h2>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-[15px] min-[560px]:grid-cols-[max-content_1fr]">
          {A_BRIEF.rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-semibold text-[var(--text)]">{k}</dt>
              <dd className="text-[var(--text-2)]">{v}</dd>
            </div>
          ))}
        </dl>
        {has("reg") && (
          <label className={field}>
            Пункт 1.2 «Общих положений» по памяти — все нормативные документы
            (329-ФЗ, приказ № 22, приказ № 554, «боевая арена»)
            <Textarea
              rows={3}
              value={s("norm")}
              onChange={(e) => set("norm", e.target.value)}
              disabled={readOnly}
            />
          </label>
        )}
      </section>

      {/* Регламент */}
      {has("reg") && (
        <section className="surface-card flex flex-col gap-3 p-4">
          <h2 className="text-[18px]">Регламент</h2>
          <p className="text-[14px] text-[var(--text-2)]">
            Пиши полными предложениями, как в официальном документе. Разделы 1–5
            обязательные — названия ровно такие. 6–8 добавляют баллы за
            качество.
          </p>
          {A_REG.map((r) => {
            const n = s(r.id).trim().length;
            return (
              <div key={r.id} className={box}>
                <h3 className="text-[16px] font-semibold text-[var(--text)]">
                  {r.title}{" "}
                  {!r.must && (
                    <span className="text-[12px] font-normal text-[var(--text-3)]">
                      · дополнительный
                    </span>
                  )}
                </h3>
                <ul className="flex flex-col gap-1">
                  {r.need.map((t, i) => (
                    <li key={i}>
                      <label className="flex items-start gap-2 text-[14px] text-[var(--text)]">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={!!w[`${r.id}c${i}`]}
                          onChange={(e) =>
                            set(`${r.id}c${i}`, e.target.checked)
                          }
                          disabled={readOnly}
                        />
                        {t}
                      </label>
                    </li>
                  ))}
                </ul>
                <Textarea
                  rows={6}
                  placeholder={r.start}
                  value={s(r.id)}
                  onChange={(e) => set(r.id, e.target.value)}
                  disabled={readOnly}
                />
                <p
                  className={cn(
                    "text-right font-mono text-[12px]",
                    n >= r.min
                      ? "text-[var(--success-ink)]"
                      : "text-[var(--text-3)]",
                  )}
                >
                  {n} знаков · цель {r.min}+
                </p>
              </div>
            );
          })}
        </section>
      )}

      {/* Сетка */}
      {has("grid") && (
        <section className="surface-card flex flex-col gap-3 p-4">
          <h2 className="text-[18px]">Сетка</h2>
          <p className="text-[14px] text-[var(--text-2)]">
            Назови 8 команд по посеву (1 — сильнейшая). Пары 1–8, 4–5, 3–6, 2–7
            соберутся сами. Поставь время каждому матчу{" "}
            <b>по своему расписанию</b> в формате 10:00 и выбери победителей.
          </p>
          <div className="grid grid-cols-2 gap-2 min-[720px]:grid-cols-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <label key={i} className={field}>
                Посев {i}
                <Input
                  value={s(`seed${i}`)}
                  placeholder={`Команда ${i}`}
                  onChange={(e) => set(`seed${i}`, e.target.value)}
                  disabled={readOnly}
                />
              </label>
            ))}
          </div>
          <div className="overflow-x-auto">
            <div className="grid min-w-[620px] grid-cols-3 items-center gap-3">
              {(["ЧФ", "ПФ", "Финал"] as const).map((round) => (
                <div key={round} className="flex flex-col justify-around gap-3">
                  <p className="font-mono text-[12px] uppercase text-[var(--text-3)]">
                    {round === "ЧФ"
                      ? "Четвертьфиналы"
                      : round === "ПФ"
                        ? "Полуфиналы"
                        : "Финал"}
                  </p>
                  {A_MATCHES.filter((m) => m.round === round).map((m) => (
                    <div key={m.id} className={box}>
                      <span className="font-mono text-[12px] font-semibold text-[var(--points-ink)]">
                        {m.label} · {m.bo}
                      </span>
                      <Input
                        className="h-9 text-[14px]"
                        placeholder="20.03 · 10:00"
                        value={s(`${m.id}t`)}
                        onChange={(e) => set(`${m.id}t`, e.target.value)}
                        disabled={readOnly}
                      />
                      <select
                        className="h-9 rounded-[var(--radius-control)] border border-[var(--border-field)] bg-[var(--surface)] px-2 text-[14px] text-[var(--text)]"
                        value={s(`${m.id}w`)}
                        onChange={(e) => set(`${m.id}w`, e.target.value)}
                        disabled={readOnly}
                        aria-label={`Победитель: ${m.label}`}
                      >
                        <option value="">кто победил?</option>
                        <option value="a">{sideName(w, m.a)}</option>
                        <option value="b">{sideName(w, m.b)}</option>
                      </select>
                    </div>
                  ))}
                  {round === "Финал" && (
                    <p className="font-display text-[16px] font-bold text-[var(--success-ink)]">
                      {w.m7w
                        ? `Чемпион: ${winnerName(w, "m7")}`
                        : "Чемпион — выбери победителя финала"}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Презентация */}
      {has("pres") && (
        <section className="surface-card flex flex-col gap-3 p-4">
          <h2 className="text-[18px]">
            Презентация для спонсора — содержание слайдов
          </h2>
          <p className="text-[14px] text-[var(--text-2)]">
            Заголовок-мысль и 2–4 коротких пункта. Цифры — из своего регламента.
            Дизайн потом в PowerPoint.
          </p>
          <div className={box}>
            <h3 className="text-[16px] font-semibold text-[var(--text)]">Бренд турнира</h3>
            <p className="text-[13px] text-[var(--text-3)]">Придумай заранее и выучи — он работает в модулях А, Г и Д.</p>
            <div className="grid gap-2 min-[640px]:grid-cols-2">
              {A_BRAND.map((b) => (
                <label key={b.id} className={field}>
                  {b.label}
                  <Input value={s(b.id)} onChange={(e) => set(b.id, e.target.value)} disabled={readOnly} />
                </label>
              ))}
            </div>
          </div>
          {A_SLIDES.map((sl) => (
            <div key={sl.id} className={box}>
              <h3 className="text-[16px] font-semibold text-[var(--text)]">
                {sl.t}
              </h3>
              <p className="text-[13px] text-[var(--text-3)]">{sl.hint}</p>
              <Input
                placeholder="Заголовок-мысль, а не тема"
                value={s(`${sl.id}h`)}
                onChange={(e) => set(`${sl.id}h`, e.target.value)}
                disabled={readOnly}
              />
              {sl.smeta && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-[14px]">
                    <tbody>
                      {A_SMETA.map((row, i) => (
                        <tr
                          key={row}
                          className="border-b border-[var(--border-soft)]"
                        >
                          <td className="py-1.5 pr-2">{row}</td>
                          <td className="py-1.5 pr-2">
                            <Input
                              className="h-9"
                              placeholder="расчёт: 20 × 2 500"
                              value={s(`smc${i}`)}
                              onChange={(e) => set(`smc${i}`, e.target.value)}
                              disabled={readOnly}
                              aria-label={`Расчёт: ${row}`}
                            />
                          </td>
                          <td className="w-36 py-1.5">
                            <Input
                              type="number"
                              min={0}
                              step={1000}
                              className="h-9"
                              value={s(`sm${i}`)}
                              onChange={(e) => set(`sm${i}`, e.target.value)}
                              disabled={readOnly}
                              aria-label={row}
                            />
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <th className="py-2 text-left">Итого</th>
                        <th />
                        <th
                          className={cn(
                            "py-2 text-left font-mono-num",
                            total > A_BRIEF.budget && "text-[var(--danger)]",
                          )}
                        >
                          {total.toLocaleString("ru-RU")} ₽
                          {total > A_BRIEF.budget ? " — больше бюджета!" : ""}
                        </th>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
              {sl.id === "s7" && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-[14px]">
                    <tbody>
                      {A_REACH.map((r, i) => (
                        <tr key={r} className="border-b border-[var(--border-soft)]">
                          <td className="py-1.5 pr-2">{r}</td>
                          <td className="py-1.5 pr-2">
                            <Input className="h-9" placeholder="расчёт: 5 постов × 3 000" value={s(`mr${i}c`)} onChange={(e) => set(`mr${i}c`, e.target.value)} disabled={readOnly} aria-label={`Расчёт: ${r}`} />
                          </td>
                          <td className="w-32 py-1.5">
                            <Input className="h-9" placeholder="контактов" value={s(`mr${i}n`)} onChange={(e) => set(`mr${i}n`, e.target.value)} disabled={readOnly} aria-label={`Контактов: ${r}`} />
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <th className="py-2 text-left">Итого</th>
                        <th />
                        <th className="py-2 text-left font-mono-num">≈ {reachSum(w).toLocaleString("ru-RU")}</th>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
              {sl.id === "s8" && (
                <div className="flex flex-col gap-2">
                  {A_PACKS.map((pk, i) => (
                    <div key={pk} className="grid gap-2 min-[640px]:grid-cols-[1fr_8rem_2fr]">
                      <Input className="h-9" placeholder={pk} value={s(`pk${i}n`)} onChange={(e) => set(`pk${i}n`, e.target.value)} disabled={readOnly} aria-label="Пакет" />
                      <Input className="h-9" placeholder="вклад" value={s(`pk${i}v`)} onChange={(e) => set(`pk${i}v`, e.target.value)} disabled={readOnly} aria-label="Вклад" />
                      <Input className="h-9" placeholder="что получает партнёр" value={s(`pk${i}g`)} onChange={(e) => set(`pk${i}g`, e.target.value)} disabled={readOnly} aria-label="Что получает" />
                    </div>
                  ))}
                </div>
              )}
              <Textarea
                rows={3}
                value={s(`${sl.id}b`)}
                onChange={(e) => set(`${sl.id}b`, e.target.value)}
                disabled={readOnly}
              />
            </div>
          ))}
        </section>
      )}

      {/* Заявка */}
      {has("app") && (
        <section className="surface-card flex flex-col gap-3 p-4">
          <h2 className="text-[18px]">Заявка (Приложение 6)</h2>
          <p className="rounded-[var(--radius-control)] border border-[var(--warning-border)] bg-[var(--warning-bg)] px-3 py-2 text-[14px] text-[var(--text)]">
            <b>Главная ловушка модуля:</b> разные цифры в разных файлах.
            Призовой фонд, команды и участники (с запасными), дата, время матчей
            — везде одинаковые. Пустых полей не оставляй: где данных нет — «не
            требуется» или условные данные.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-[14px]">
              <tbody>
                {A_FORM.map(([group, fields], gi) => (
                  <FormGroup
                    key={group}
                    group={group}
                    fields={fields}
                    gi={gi}
                    s={s}
                    set={set}
                    readOnly={readOnly}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Разбор */}
      <section className="surface-card flex flex-col gap-3 p-4">
        <h2 className="text-[18px]">Разбор</h2>
        <p className="text-[14px] text-[var(--text-2)]">
          Проверка по измеримым критериям и сверка цифр между файлами. Это
          подсказка программы, а не оценка эксперта: судейские аспекты оценит
          тренер.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setReview(reviewWorkbook(w, parts))}>
            {review ? "Обновить разбор" : "Показать разбор"}
          </Button>
          <Button variant="outline" onClick={copyAll}>
            Скопировать всё для Word
          </Button>
        </div>
        {review && <ReviewList cards={review} />}
      </section>
    </div>
  );
}

function FormGroup({
  group,
  fields,
  gi,
  s,
  set,
  readOnly,
}: {
  group: string;
  fields: string[];
  gi: number;
  s: (id: string) => string;
  set: (id: string, v: string) => void;
  readOnly: boolean;
}) {
  return (
    <>
      <tr>
        <td
          colSpan={2}
          className="bg-[var(--surface-muted)] px-2 py-1.5 font-semibold text-[var(--text)]"
        >
          {group}
        </td>
      </tr>
      {fields.map((f, fi) => {
        const id = `z${gi}_${fi}`;
        const empty = !s(id).trim();
        return (
          <tr key={id} className="border-b border-[var(--border-soft)]">
            <td className="w-[45%] px-2 py-1.5 text-[var(--text)]">
              <label htmlFor={`f-${id}`}>{f}</label>
            </td>
            <td className="py-1.5">
              <Input
                id={`f-${id}`}
                placeholder={A_FORM_HINTS[id]}
                className={cn("h-9", empty && "border-[var(--danger-border)]")}
                value={s(id)}
                onChange={(e) => set(id, e.target.value)}
                disabled={readOnly}
              />
            </td>
          </tr>
        );
      })}
    </>
  );
}

/** Карточки разбора: «Правильно» и «Исправить» по каждому продукту */
export function ReviewList({ cards }: { cards: ReviewCard[] }) {
  return (
    <div className="flex flex-col gap-3">
      {cards.map((c) => (
        <div key={c.title} className={box}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[16px] font-semibold text-[var(--text)]">
              {c.title}
            </h3>
            <span className="font-mono text-[13px] text-[var(--text-2)]">
              {c.max ? `из ${c.max} б. · ` : ""}✓ {c.good.length} · ✗{" "}
              {c.bad.length}
            </span>
          </div>
          {c.good.length > 0 && (
            <>
              <p className="text-[13px] font-semibold text-[var(--success-ink)]">
                Правильно
              </p>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-[14px] text-[var(--text)]">
                {c.good.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </>
          )}
          {c.bad.length > 0 && (
            <>
              <p className="text-[13px] font-semibold text-[var(--danger)]">
                Исправить
              </p>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-[14px] text-[var(--text)]">
                {c.bad.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
