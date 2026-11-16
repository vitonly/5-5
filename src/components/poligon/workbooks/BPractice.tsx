"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Workbook } from "@/lib/poligon/a-practicum";
import { makeBDataset } from "@/lib/poligon/b-dataset";
import { B_CHARTS, B_MODES, B_PIVOTS, bDelivery, bSections, reviewBPractice, type BReview } from "@/lib/poligon/b-practice";
import { toast } from "@/components/ui/toast";

const card = "flex min-w-0 flex-col gap-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-muted)] p-4";
const control = "min-h-11 w-full min-w-0 touch-manipulation rounded-[var(--radius-control)] border border-[var(--border-field)] bg-[var(--surface)] px-3 py-2 text-base text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:opacity-70";
const button = "min-h-11 touch-manipulation rounded-[var(--radius-control)] border border-[var(--border)] px-4 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:opacity-50";
type Choice = string | readonly [string, string];
const decisions: Choice[] = [["keep", "Оставить строки"], ["remove", "Удалить повтор"], ["partial", "Сохранить событие, исправить или учесть часть данных"]];
const actions: Choice[] = [["replace", "Заменить устаревшую копию актуальной"], ["rename", "Исправить имя файла"], ["save", "Сохранить открытую книгу"], ["move", "Переместить в папку сдачи"], ["keep", "Оставить как есть"]];

function parse(value: unknown): unknown {
  try { return typeof value === "string" ? JSON.parse(value) : null; } catch { return null; }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function isWorkbook(value: unknown): value is Workbook {
  return isRecord(value) && Object.values(value).every(v => typeof v === "string" || typeof v === "boolean");
}
function frozenReview(value: unknown): BReview | null {
  const report = parse(value);
  if (!isRecord(report) || !Array.isArray(report.checks) || !Array.isArray(report.failedIds)) return null;
  if (!report.failedIds.every(id => typeof id === "string") || !report.checks.every(c => isRecord(c)
    && typeof c.id === "string" && typeof c.label === "string" && typeof c.feedback === "string"
    && (c.ok === null || typeof c.ok === "boolean") && Array.isArray(c.aspectIds)
    && c.aspectIds.every(id => typeof id === "string"))) return null;
  return report as BReview;
}
function Table({ rows, caption }: { rows: string[][]; caption: string }) {
  return <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={caption}>
    <table className="w-full border-collapse text-left text-sm">
      <caption className="pb-2 text-left font-medium">{caption}</caption>
      <thead><tr>{rows[0]?.map((cell, i) => <th scope="col" key={i} className="border border-[var(--border)] bg-[var(--surface)] p-2">{cell}</th>)}</tr></thead>
      <tbody>{rows.slice(1).map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} className="whitespace-pre-wrap border border-[var(--border)] p-2">{cell || "—"}</td>)}</tr>)}</tbody>
    </table>
  </div>;
}

/** Отображаем факты Office отдельно от учебного разбора и оценок наставника. */
function FileFacts({ value }: { value: unknown }) {
  if (!Array.isArray(value) || !value.length) return null;
  return <div className="flex flex-col gap-3" aria-live="polite">
    <h3 className="font-semibold">Что прочитано в сохранённых файлах</h3>
    {value.map((file, i) => {
      if (!isRecord(file)) return null;
      const facts = isRecord(file.facts) ? file.facts : null;
      return <div key={i} className={card}>
        <h4 className="break-all font-medium">{String(file.name ?? "Файл")}</h4>
        {typeof file.error === "string" && <p className="text-[var(--danger)]">{file.error}</p>}
        {facts && <>
          {Array.isArray(facts.worksheets) && <p>Листы: {facts.worksheets.filter(isRecord).map(s => String(s.name)).join(", ")}. Ячеек: {String(facts.cells ?? "—")}.</p>}
          {Array.isArray(facts.pivots) && <><p>Найдено сводных: {facts.pivots.length}.</p><ul className="list-inside list-disc">{facts.pivots.filter(isRecord).map((p, j) => <li key={j}>{String(p.name ?? "Без имени")} · диапазон {String(p.ref ?? "не указан")}</li>)}</ul></>}
          {Array.isArray(facts.chartTypes) && <p>Типы диаграмм в XLSX: {facts.chartTypes.map(String).join(", ") || "не найдены"}.</p>}
          {typeof facts.count === "number" && <p>Слайдов: {facts.count}. Формат 16:9: {facts.aspect16by9 === true ? "да" : facts.aspect16by9 === false ? "нет" : "не указан"}.</p>}
          {Array.isArray(facts.slides) && <details><summary className="min-h-11 cursor-pointer py-2">Прочитанный текст слайдов</summary>{facts.slides.filter(isRecord).map((s, j) => <p key={j} className="whitespace-pre-wrap break-words py-2">{j + 1}. {String(s.text ?? "")}</p>)}</details>}
        </>}
        {Array.isArray(file.requirements) && <ul className="flex flex-col gap-2">{file.requirements.filter(isRecord).map((r, j) => <li key={j} className={r.ok === false ? "text-[var(--danger)]" : r.ok === null ? "text-[var(--warning-ink)]" : "text-[var(--success-ink)]"}>{String(r.label)}: {r.ok === null ? "ожидает проверки" : r.ok ? "подтверждено" : "нужно исправить"}. {String(r.feedback ?? "")}</li>)}</ul>}
      </div>;
    })}
    <p>Это факты о файлах, без автоматического начисления баллов. Данные сводных, выводы, оформление и физическую флешку проверяет наставник.</p>
  </div>;
}

type BPracticeProps = {
  id: string;
  initial: Workbook;
  readOnly?: boolean;
  onChange?: (w: Workbook) => void;
  attemptId?: string;
  onFlush?: () => Promise<void>;
};

export function BPractice(props: BPracticeProps) {
  return <BPracticeWorkbook key={`${props.id}:${props.attemptId ?? ""}:${String(props.initial._b_seed ?? "")}:${!!props.readOnly}`} {...props} />;
}

function BPracticeWorkbook({ id, initial, readOnly = false, onChange, attemptId, onFlush }: BPracticeProps) {
  const [w, setW] = useState<Workbook>(initial);
  const current = useRef(initial);
  const edited = useRef(false);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const [review, setReview] = useState<BReview | null>(() => readOnly ? frozenReview(initial._b_report) ?? reviewBPractice(id, initial) : null);
  const [facts, setFacts] = useState<unknown>(() => parse(initial._b_filecheck));
  const [checking, setChecking] = useState(false);
  const checkLock = useRef(false);
  const draftWarning = useRef(false);
  const seed = String(initial._b_seed ?? "");
  const mode = String(initial._b_mode ?? "guided");
  const d = useMemo(() => makeBDataset(seed), [seed]);
  const sections = bSections(id);
  const delivery = bDelivery(seed);
  const focusValue = parse(initial._b_focus);
  const focus = Array.isArray(focusValue) ? focusValue.filter((v): v is string => typeof v === "string") : [];
  const retry = mode === "retry" && focus.length > 0;
  const show = (...ids: string[]) => !retry || focus.some(f => ids.includes(f));
  const pivotVisible = (pivotId: string) => !retry || focus.some(f => f === `pivot_${pivotId}` || f.startsWith(`aggregate_${pivotId}_`));
  const hints = mode === "guided" || review !== null;
  const s = (key: string) => String(w[key] ?? "");

  // Workspace удаляет только draft, совпавший с успешно загруженной версией w.
  // Здесь draft никогда не удаляется: он страхует незавершённую очередь сохранения.
  useEffect(() => {
    if (readOnly || !attemptId || !seed) return;
    const timer = setTimeout(() => {
      try {
        const draft: unknown = parse(localStorage.getItem(`startplus:b-draft:${attemptId}`));
        if (edited.current || !isRecord(draft) || draft.seed !== seed || !isWorkbook(draft.w)) return;
        const restored: Workbook = { ...draft.w };
        // Служебные поля задаёт сервер, а не старый локальный черновик.
        for (const key of ["_b_seed", "_b_mode", "_b_focus", "_b_report", "_b_filecheck", "_b_revealed"]) {
          if (initial[key] === undefined) delete restored[key]; else restored[key] = initial[key];
        }
        current.current = restored;
        setW(restored);
        onChangeRef.current?.(restored);
      } catch {
        toast.error("Не удалось прочитать локальный черновик");
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [attemptId, seed, readOnly, initial]);

  function set(key: string, value: string) {
    if (readOnly) return;
    edited.current = true;
    const next = { ...current.current, [key]: value };
    current.current = next;
    setW(next);
    if (attemptId && seed) {
      try { localStorage.setItem(`startplus:b-draft:${attemptId}`, JSON.stringify({ seed: initial._b_seed, w: next })); }
      catch {
        if (!draftWarning.current) toast.error("Локальный черновик недоступен. Перед выходом дождись сохранения на сервере.");
        draftWarning.current = true;
      }
    }
    onChange?.(next);
    // После правки прежний разбор не выдаём за проверку нового ответа.
    setReview(null);
  }

  function input(key: string, label: string, numeric = false) {
    return <label className="flex min-w-0 flex-col gap-1" key={key}>{label}
      <input className={control} type={numeric ? "number" : "text"} step={numeric ? "any" : undefined} value={s(key)} disabled={readOnly} onChange={e => set(key, e.target.value)} />
    </label>;
  }
  function prose(key: string, label: string) {
    return <label className="flex flex-col gap-1">{label}<textarea className={control} rows={3} value={s(key)} disabled={readOnly} onChange={e => set(key, e.target.value)} /></label>;
  }
  function select(key: string, label: string, options: readonly Choice[]) {
    return <label className="flex min-w-0 flex-col gap-1" key={key}>{label}
      <select className={control} value={s(key)} disabled={readOnly} onChange={e => set(key, e.target.value)}>
        <option value="">Выбери вариант</option>
        {options.map(option => { const [value, title] = typeof option === "string" ? [option, option] : option; return <option key={value} value={value}>{title}</option>; })}
      </select>
    </label>;
  }
  function feedback(...ids: string[]) {
    const checks = review?.checks.filter(c => ids.includes(c.id));
    return checks?.map(c => <div key={c.id} className={`rounded-[var(--radius-control)] border p-3 ${c.ok === null ? "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-ink)]" : c.ok ? "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-ink)]" : "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)]"}`}>
      <p className="font-medium">{c.ok === null ? "Ожидает наставника" : c.ok ? "Ответ совпал" : "Нужно исправить"} · {c.label}</p>
      <p>{c.feedback}</p>
    </div>);
  }
  async function checkFiles() {
    if (!attemptId || readOnly || checkLock.current) return;
    checkLock.current = true;
    setChecking(true);
    try {
      await onFlush?.();
      const response = await fetch(`/api/poligon/attempts/${encodeURIComponent(attemptId)}/b-check`, { method: "POST" });
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.facts)) throw new Error(typeof result.error === "string" ? result.error : "Не получилось проверить файлы");
      setFacts(result.facts);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не получилось проверить. Проверь интернет.");
    } finally { checkLock.current = false; setChecking(false); }
  }
  async function showReview() {
    if (!attemptId || checking) return;
    setChecking(true);
    try {
      await onFlush?.();
      const res = await fetch(`/api/poligon/attempts/${attemptId}/b-feedback`, { method: "POST" });
      if (!res.ok) throw new Error("Сначала сохрани ответы, затем открой разбор ещё раз");
      setReview(reviewBPractice(id, current.current));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Не удалось открыть разбор"); }
    finally { setChecking(false); }
  }

  if (!seed) return <p role="alert" className={card}>В попытке нет исходных данных. Обнови страницу или начни новую попытку со страницы задания.</p>;

  const cleanCases = d.cleaningCases.filter(c => show(`clean_${c.id}`));
  const reportVisible = sections.report && (!retry || focus.some(f => /^(calc_|top5$|pivot_|aggregate_|evidence$|report_meaning$)/.test(f)));
  const visualVisible = sections.visual && (!retry || focus.some(f => /^(chart_|claim$|visual_judgement$)/.test(f)));
  const deliveryVisible = sections.delivery && (!retry || focus.some(f => /^(delivery_|workplace$)/.test(f)));
  const fieldOptions = [...new Set([...Object.values(d.rawSheets).flatMap(rows => rows[0].map(String)), ...d.cleaningCases.flatMap(c => c.fields)])];
  const comparisons: Choice[] = d.cleaningCases.map(c => [c.comparison, ({
    exact: "Все значения двух строк одинаковы",
    "other-id": "Регистрационные номера разные, название и состав одни и те же",
    similar: "Команды и день те же, начало в разное время",
    platforms: "Одна встреча, разные площадки трансляции",
    "missing-duration": "Событие зарегистрировано, число минут не указано",
    format: "Значения требуют очистки текста и перевода длительности в минуты",
  })[c.id]]);

  return <div className="flex min-w-0 flex-col gap-5 text-[var(--text)]">
    <section className="surface-card flex flex-col gap-3 p-4">
      <h2 className="text-xl font-semibold">Практика модуля Б</h2>
      <p>Режим: {B_MODES[mode as keyof typeof B_MODES] ?? "Неизвестен"}. Режим закреплён за попыткой.</p>
      {retry && <div className={card}><h3 className="font-semibold">Повтор ошибок на новых данных</h3><p>Решай упражнения заново в новой книге. Старые ответы не переносятся.</p><p className="break-words text-sm">Ошибки прошлого разбора: {focus.join(", ")}</p></div>}
      <p>Скачай исходную книгу, обработай данные в настоящем Excel и сохраняй результаты работы. Ответы здесь помогают разобрать ход решения.</p>
      {attemptId && <a className={`${button} self-start`} href={`/api/poligon/attempts/${encodeURIComponent(attemptId)}/b-dataset`} download>Скачать исходные данные XLSX</a>}
      {!hints && <p>Подсказки скрыты до разбора.</p>}
    </section>

    {sections.clean && cleanCases.length > 0 && <section className="surface-card flex flex-col gap-4 p-4">
      <h2 className="text-xl font-semibold">1. Очистка данных и журнал решений</h2>
      <p>Сравни строки, выбери поля сравнения и действие. Отметь только необходимые поля. Эти решения перенеси в лист «Журнал» книги Excel.</p>
      {cleanCases.map(c => <article key={c.id} className={card}>
        <h3 className="font-semibold">{c.title}</h3>
        <div className={review ? "grid gap-4 min-[720px]:grid-cols-2" : ""}><Table rows={c.before} caption="Было" />{review && <Table rows={c.after} caption="Стало — разбор" />}</div>
        <fieldset className="flex flex-col gap-2" disabled={readOnly}><legend className="mb-1">Какие поля сравниваешь?</legend>
          <div className="grid gap-1 sm:grid-cols-2">{[...new Set([...c.fields, ...c.before[0], "Название", "ID_матча"])].map(field => <label key={field} className="flex min-h-11 touch-manipulation items-center gap-3 rounded-[var(--radius-control)] border border-[var(--border)] px-3 py-2">
            <input type="checkbox" className="size-5 shrink-0 accent-[var(--points)]" checked={s(`fields_${c.id}`).split("|").includes(field)} onChange={e => {
              const selected = String(current.current[`fields_${c.id}`] ?? "").split("|").filter(Boolean);
              set(`fields_${c.id}`, (e.target.checked ? [...new Set([...selected, field])] : selected.filter(f => f !== field)).join("|"));
            }} /><span className="break-all">{field}</span>
          </label>)}</div>
        </fieldset>
        {select(`compare_${c.id}`, "Что показало сравнение?", comparisons)}
        {select(`decision_${c.id}`, "Решение для журнала", decisions)}
        {prose(`journal_${c.id}`, "Обоснование и влияние на итоговые показатели (обсуди с наставником)")}
        {hints && <p className="text-sm text-[var(--text-2)]">Excel: {c.excel}</p>}
        {feedback(`clean_${c.id}`)}
      </article>)}
    </section>}

    {reportVisible && <section className="surface-card flex flex-col gap-4 p-4">
      <h2 className="text-xl font-semibold">2. Расчёты, сводные и вывод</h2>
      <p>Сначала очисти данные. Построй в Excel три сводные таблицы: матчи по часам начала, инциденты по типам, зрители по платформам. Загрузи итоговый XLSX в общий блок файлов попытки.</p>
      {hints && <p className="text-sm text-[var(--text-2)]">СЧЁТЗ считает заполненные ID, СУММ — числовые значения. Не заменяй неизвестную длительность нулём. Для топ-5 сортируй длительность по убыванию, при равенстве — ID по возрастанию.</p>}
      <div className="grid gap-3 sm:grid-cols-2">{([
        ["teams", "Число команд"], ["players", "Число игроков"], ["matches", "Число матчей"], ["incidents", "Число инцидентов"], ["network", "Известная длительность сетевых сбоев, мин"],
      ] as const).filter(([key]) => show(`calc_${key}`)).map(([key, label]) => <div key={key} className={card}>{input(`calc_${key}`, label, true)}{feedback(`calc_${key}`)}</div>)}</div>
      {show("top5") && <div className={card}>{input("top5", "Топ-5 матчей по длительности: ID по порядку, через запятую")}{feedback("top5")}</div>}
      {B_PIVOTS.filter(p => pivotVisible(p.id)).map(p => {
        const groups = p.id === "time" ? d.totals.byHour : p.id === "incident" ? d.totals.byIncident : d.totals.byPlatform;
        const fields = ["Нет", ...fieldOptions, "Час начала"];
        return <article className={card} key={p.id}>
          <h3 className="font-semibold">Сводная: {p.title}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {select(`${p.id}_row`, "Строки", fields)}
            {select(`${p.id}_column`, "Столбцы", fields)}
            {select(`${p.id}_value`, "Значения", fields)}
            {select(`${p.id}_operation`, "Операция", ["Сумма", "Количество", "Среднее", "Максимум", "Минимум"])}
          </div>
          {hints && <p className="text-sm text-[var(--text-2)]">{p.hint}</p>}
          {feedback(`pivot_${p.id}`)}
          <div className="grid gap-3 sm:grid-cols-2">{Object.keys(groups).map((key, index) => <div className="flex flex-col gap-2" key={key}>
            {input(`agg_${p.id}_${index}`, `Итог группы «${key}»`, true)}{feedback(`aggregate_${p.id}_${index}`)}
          </div>)}</div>
        </article>;
      })}
      {show("evidence", "report_meaning") && <article className={card}>
        <h3 className="font-semibold">Докажи сравнение двух самых длительных матчей</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {input("evidence_a", "ID самого длительного матча")}
          {input("evidence_b", "ID второго по длительности матча")}
          {select("evidence_source", "Лист-источник", Object.keys(d.rawSheets))}
          {input("evidence_diff", "Разница длительности, мин", true)}
        </div>
        {prose("report_explanation", "Вывод: исходные строки → показатель → ограничение данных → решение")}
        <p className="text-sm text-[var(--text-2)]">Обоснование и соответствие шаблону проверяет наставник. Объём текста не подтверждает правильность.</p>
        {feedback("evidence", "report_meaning")}
      </article>}
    </section>}

    {visualVisible && <section className="surface-card flex flex-col gap-4 p-4">
      <h2 className="text-xl font-semibold">3. Диаграммы и презентация</h2>
      <p>В отчёте XLSX используй минимум два разных типа диаграмм. Подготовь PPTX: ровно 5 слайдов, широкий формат (16:9). Загрузи оба файла в общий блок файлов попытки.</p>
      {B_CHARTS.filter(c => show(`chart_${c.id}`)).map(c => <article className={card} key={c.id}>
        <h3 className="font-semibold">{c.title}</h3>
        {select(`chart_${c.id}`, "Тип диаграммы", ["Столбцы", "Полосы", "Линия", "Кольцо", "Круг", "Точечная"])}
        {hints && <p className="text-sm text-[var(--text-2)]">{c.hint}</p>}
        {feedback(`chart_${c.id}`)}
      </article>)}
      <div className={card}>
        {prose("visual_claim", "Заголовок-вывод: что сравниваешь, какие значения и какое ограничение?")}
        {input("visual_sources", "Источники: листы, ID строк и диапазоны диаграмм")}
        {hints && <p className="text-sm text-[var(--text-2)]">Excel → Выбрать данные: сверь диапазоны. Открой PowerPoint в режиме показа, проверь подписи, единицы и читаемость.</p>}
        <p>Смысл вывода, источники, подписи, легенду и читаемость проверяет наставник.</p>
        {feedback("claim", "visual_judgement")}
      </div>
    </section>}

    {deliveryVisible && <section className="surface-card flex flex-col gap-4 p-4">
      <h2 className="text-xl font-semibold">4. Подготовка к сдаче · Уч{delivery.number}</h2>
      <div className={card}><h3 className="font-semibold">Файлы до исправлений</h3><pre className="overflow-x-auto whitespace-pre-wrap break-all text-sm">{`Рабочий стол/
└─ Уч${delivery.number}/
   ├─ Обработанные_данные_Уч${delivery.number}_старые.xlsx
   └─ Аналитический_отчёт_Уч99.xlsx
Загрузки/
└─ Презентация_Б_Уч${delivery.number}.pptx
Excel: аналитический отчёт открыт, но не сохранён`}</pre></div>
      {delivery.rows.filter(r => show(`delivery_${r.id}`)).map(r => <article className={card} key={r.id}>
        <h3 className="break-all font-medium">{r.before}</h3>
        {select(`delivery_${r.id}`, "Что сделать?", actions)}
        {hints && <p className="text-sm text-[var(--text-2)]">{r.hint}</p>}
        {review && <p className="break-all">После исправления: {r.after}</p>}
        {feedback(`delivery_${r.id}`)}
      </article>)}
      {show("delivery_open", "workplace") && <div className={card}>
        <h3 className="font-semibold">Проверка актуальных копий</h3>
        {select("open_pc", "Какие файлы открыть на ПК?", [["current", "Все три актуальных файла из папки сдачи"], ["old", "Старые копии"], ["recent", "Из списка недавних файлов"], ["none", "Не открывать"]])}
        {select("open_usb", "Какие файлы открыть с физической флешки?", [["current", "Все три актуальных файла с флешки"], ["old", "Старые копии с флешки"], ["pc", "Достаточно копий на ПК"], ["none", "Не открывать"]])}
        {prose("delivery_explanation", "Как убедишься, что на ПК и флешке сохранены актуальные версии?")}
        <p>Очную репетицию, порядок рабочего места и копии на физической флешке подтверждает наставник.</p>
        {feedback("delivery_open", "workplace")}
      </div>}
    </section>}

    <section className="surface-card flex flex-col gap-3 p-4">
      <h2 className="text-lg font-semibold">Разбор и проверка файлов</h2>
      <p>Работы прикрепляй в общий блок файлов этой попытки. После загрузки дождись сохранения, затем запусти проверку Office.</p>
      {!readOnly && <div className="flex flex-wrap gap-3">
        <button type="button" disabled={checking} className={`${button} bg-[var(--points)] text-[var(--on-points)]`} onClick={showReview}>Показать разбор ответов</button>
        {attemptId && <button type="button" className={button} disabled={checking} onClick={checkFiles}>{checking ? "Читаю файлы…" : "Проверить сохранённые файлы Office"}</button>}
      </div>}
      {review && <div aria-live="polite" className={card}>
        <p>Ответов для исправления: {review.checks.filter(c => c.ok === false).length}. Ожидают наставника: {review.checks.filter(c => c.ok === null).length}.</p>
        <p>Разбор сверяет ответы с данными. Итоговую оценку выставляет наставник.</p>
        {review.checks.filter(c => c.ok === false).map(c => <p key={c.id} className="text-[var(--danger)]">Нужно исправить: {c.label} · {c.feedback}</p>)}
        {review.checks.filter(c => c.ok === null).map(c => <p key={c.id} className="text-[var(--warning-ink)]">Ожидает наставника: {c.label} · {c.feedback}</p>)}
      </div>}
      <FileFacts value={facts} />
      {readOnly && <Link href={`/poligon/b/test/${encodeURIComponent(id)}`} className={`${button} self-start`}>К заданию и новой попытке</Link>}
    </section>
  </div>;
}
