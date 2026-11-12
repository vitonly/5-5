"use client";

/*
 * Модуль А за 4 часа — как на чемпионате, но с автопроверкой.
 * 0 — инструкция → 1–4 задания строго по очереди (в каждом загружаешь настоящий файл) → 5 — проверка.
 * Вводная каждый раз случайная. Проверка — только в конце, как у экспертов.
 * Всё хранится в тетради попытки:
 *   brief — вводная (JSON), stage — текущий шаг, t1…t5 — когда начат каждый шаг,
 *   f_<этап> / n_<этап> — ссылка и имя файла, report — результат проверки (JSON), self_* — самопроверка.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { uploadAppFile } from "@/lib/upload-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { confirmAction } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";
import type { Workbook } from "@/lib/poligon/a-practicum";
import {
  A_JUDGED,
  A_SELF,
  A_STAGES,
  A_TOTAL,
  briefRows,
  makeBrief,
  parseBrief,
  reportScore,
  type AReport,
} from "@/lib/poligon/a-four";

/** Минуты между двумя отметками времени */
const minutesBetween = (a?: string | boolean, b?: string | boolean | number) => {
  if (!a || typeof a !== "string") return null;
  const end = typeof b === "number" ? b : typeof b === "string" ? new Date(b).getTime() : null;
  if (end === null) return null;
  return Math.max(0, Math.round((end - new Date(a).getTime()) / 60000));
};

function parseReport(raw: unknown): AReport | null {
  try {
    const r = JSON.parse(String(raw || ""));
    return r && Array.isArray(r.parts) ? (r as AReport) : null;
  } catch {
    return null;
  }
}

export function AFour({
  initial,
  readOnly = false,
  onChange,
  attemptId,
}: {
  initial: Workbook;
  readOnly?: boolean;
  onChange?: (w: Workbook) => void;
  /** Нужен, чтобы перед проверкой сохранить тетрадь на сервер */
  attemptId?: string;
}) {
  const [w, setW] = useState<Workbook>(initial);
  const [uploading, setUploading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const first = useRef(true);

  // Сообщаем родителю об изменениях (он сохраняет тетрадь), кроме первого рендера
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    onChange?.(w);
  }, [w, onChange]);

  // Часы для «на этом задании уже N мин» — обновляем раз в 20 секунд
  useEffect(() => {
    const t0 = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, []);

  const set = (patch: Workbook) => setW((old) => ({ ...old, ...patch }));
  const brief = useMemo(() => parseBrief(w.brief), [w.brief]);
  const report = useMemo(() => parseReport(w.report), [w.report]);
  const stage = Number(w.stage || 0);
  const cur = A_STAGES[stage - 1];
  const self = Object.fromEntries(A_SELF.map((s) => [s.key, !!w[s.key]]));

  /** Старт: случайная вводная и первое задание */
  function start() {
    set({ brief: JSON.stringify(makeBrief(Math.random)), stage: "1", t1: new Date().toISOString() });
  }

  /** Загрузить файл текущего задания (заменяет предыдущий) */
  async function onPick(list: FileList | null) {
    const file = list?.[0];
    if (!file || !cur) return;
    setUploading(true);
    try {
      const { url } = await uploadAppFile(file);
      set({ [`f_${cur.id}`]: url, [`n_${cur.id}`]: file.name });
      toast.success("Файл загружен");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка загрузки");
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  /** Перейти к следующему заданию — назад вернуться нельзя, как на площадке */
  async function next() {
    if (!cur) return;
    if (!w[`f_${cur.id}`]) return toast.error("Сначала загрузи файл (или ссылку на сетку)");
    const last = stage === A_STAGES.length;
    const ok = await confirmAction(
      last ? "Сдать заявку и перейти к проверке? Вернуться к заданиям будет нельзя." : `Задание ${stage} готово? Вернуться к нему будет нельзя.`,
      { confirmLabel: last ? "К проверке" : "Дальше" }
    );
    if (!ok) return;
    set({ stage: String(stage + 1), [`t${stage + 1}`]: new Date().toISOString() });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Проверка: сначала сохраняем тетрадь на сервер, потом сервер открывает файлы */
  async function check() {
    if (!attemptId) return;
    setChecking(true);
    const saved = await fetch(`/api/poligon/attempts/${attemptId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workbook: w }),
    }).catch(() => null);
    if (!saved?.ok) {
      setChecking(false);
      return toast.error("Не получилось сохранить работу — проверь интернет");
    }
    const res = await fetch(`/api/poligon/attempts/${attemptId}/check`, { method: "POST" }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { report?: AReport; error?: string };
    setChecking(false);
    if (!res?.ok || !data.report) return toast.error(data.error ?? "Проверка не удалась");
    set({ report: JSON.stringify(data.report) });
  }

  /* ---------- Шаг 0: инструкция ---------- */
  if (!brief || stage === 0) {
    if (readOnly) return <p className="text-[14px] text-[var(--text-2)]">Задание ещё не начато.</p>;
    return (
      <section className="surface-card flex flex-col gap-3 p-4">
        <h2 className="text-[18px]">Как это устроено</h2>
        <ol className="list-decimal pl-5 text-[15px] text-[var(--text-2)]">
          <li>Нажмёшь «Начать» — появится <b>случайная вводная</b>: игра, дата, площадка, бюджет, спонсор. Каждый раз другая.</li>
          <li>4 задания идут <b>строго по очереди</b>: регламент → сетка → презентация → заявка. Делаешь в Word, PowerPoint и сервисе сетки, сюда загружаешь готовый файл.</li>
          <li>Назад вернуться нельзя — как на площадке. У каждого задания есть ориентир по времени, всего 4 часа.</li>
          <li>В конце сайт откроет твои файлы и проверит <b>измеряемые</b> аспекты критериев: имена файлов, 5 разделов, слайды, пустые поля и т.п. Судейские оценит тренер.</li>
        </ol>
        <p className="text-[14px] text-[var(--text-3)]">Для автопроверки сдавай .docx и .pptx — PDF сайт принимает, но прочитать не может.</p>
        <div>
          <Button size="lg" onClick={start}>Начать — получить вводную</Button>
        </div>
      </section>
    );
  }

  /* ---------- Общие куски ---------- */
  const briefCard = (
    <details open={stage <= 1 || readOnly} className="surface-card p-4">
      <summary className="cursor-pointer text-[17px] font-semibold text-[var(--text)]">Вводная — как на брифинге</summary>
      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-[15px] min-[560px]:grid-cols-[max-content_1fr]">
        {briefRows(brief).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-semibold text-[var(--text)]">{k}</dt>
            <dd className="text-[var(--text-2)]">{v}</dd>
          </div>
        ))}
      </dl>
    </details>
  );

  const steps = (
    <ol className="flex flex-wrap gap-1.5">
      {A_STAGES.map((s) => (
        <li
          key={s.id}
          className={cn(
            "rounded-full border px-3 py-1 text-[13px]",
            stage === s.n ? "border-[var(--points-ink)] bg-[var(--points-bg)] font-semibold text-[var(--text)]" : stage > s.n ? "border-[var(--success-border)] text-[var(--success-ink)]" : "border-[var(--border)] text-[var(--text-3)]"
          )}
        >
          {s.n}. {s.title}
        </li>
      ))}
      <li className={cn("rounded-full border px-3 py-1 text-[13px]", stage === 5 ? "border-[var(--points-ink)] bg-[var(--points-bg)] font-semibold" : "border-[var(--border)] text-[var(--text-3)]")}>
        Проверка
      </li>
    </ol>
  );

  /** Сколько минут ушло на каждое задание */
  const timing = (
    <table className="w-full border-collapse text-[14px]">
      <thead>
        <tr className="text-left text-[var(--text-3)]">
          <th className="py-1 pr-2 font-medium">Задание</th>
          <th className="py-1 pr-2 font-medium">Файл</th>
          <th className="py-1 pr-2 font-medium">Ушло</th>
          <th className="py-1 font-medium">Ориентир</th>
        </tr>
      </thead>
      <tbody>
        {A_STAGES.map((s) => {
          const spent = minutesBetween(w[`t${s.n}`], (w[`t${s.n + 1}`] as string) || undefined);
          const url = String(w[`f_${s.id}`] ?? "");
          return (
            <tr key={s.id} className="border-t border-[var(--border)]">
              <td className="py-1.5 pr-2">{s.title}</td>
              <td className="max-w-[220px] truncate py-1.5 pr-2">
                {url ? (
                  <a href={url} className="underline" target={url.startsWith("http") ? "_blank" : undefined} rel="noreferrer" download={!url.startsWith("http")}>
                    {String(w[`n_${s.id}`] || url)}
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td className={cn("py-1.5 pr-2", spent !== null && spent > s.minutes && "text-[var(--danger)]")}>{spent === null ? "—" : `${spent} мин`}</td>
              <td className="py-1.5 text-[var(--text-3)]">{s.minutes} мин</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  /* ---------- Шаги 1–4: задания ---------- */
  if (cur && !readOnly) {
    const spent = now === null ? null : minutesBetween(w[`t${stage}`], now);
    const fileUrl = String(w[`f_${cur.id}`] ?? "");
    const isLink = fileUrl.startsWith("http");
    return (
      <div className="flex flex-col gap-4">
        {steps}
        {briefCard}
        <section className="surface-card flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[19px]">
              Задание {cur.n} из 4. {cur.title}
            </h2>
            <span className={cn("text-[14px]", spent !== null && spent > cur.minutes ? "text-[var(--danger)]" : "text-[var(--text-3)]")}>
              {spent === null ? "" : `на задании ${spent} мин · ориентир ${cur.minutes} мин`}
            </span>
          </div>
          <p className="text-[15px] text-[var(--text)]">{cur.task}</p>
          <ul className="list-disc pl-5 text-[14px] text-[var(--text-2)]">
            {cur.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p className="text-[14px] text-[var(--text-2)]">
            Сдать: <b>{cur.file}</b>
          </p>

          <input ref={inputRef} type="file" className="hidden" accept={cur.accept} onChange={(e) => onPick(e.target.files)} />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading}>
              {uploading ? "Загружаю…" : fileUrl && !isLink ? "Заменить файл" : "Загрузить файл"}
            </Button>
            {fileUrl && (
              <span className="min-w-0 truncate text-[14px] text-[var(--text)]">
                ✓ {isLink ? fileUrl : String(w[`n_${cur.id}`] || "")}
              </span>
            )}
          </div>
          {/* Сетку можно сдать ссылкой на онлайн-сервис */}
          {cur.id === "grid" && (
            <label className="flex flex-col gap-1 text-[14px] text-[var(--text-2)]">
              …или ссылка на сетку
              <Input
                placeholder="https://…"
                value={isLink ? fileUrl : ""}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  set(v ? { f_grid: v, n_grid: "ссылка на сетку" } : { f_grid: "", n_grid: "" });
                }}
              />
            </label>
          )}
          <div>
            <Button onClick={next} disabled={!fileUrl}>
              {stage === 4 ? "Готово — к проверке" : `Готово — к заданию ${stage + 1}`}
            </Button>
          </div>
        </section>
      </div>
    );
  }

  /* ---------- Шаг 5: проверка (и просмотр у тренера) ---------- */
  const score = report ? reportScore(report, self) : null;
  return (
    <div className="flex flex-col gap-4">
      {!readOnly && steps}
      {briefCard}
      <section className="surface-card flex flex-col gap-3 p-4">
        <h2 className="text-[18px]">Файлы и время</h2>
        {timing}
      </section>

      {!report && !readOnly && (
        <section className="surface-card flex flex-col gap-3 p-4">
          <h2 className="text-[18px]">Все 4 задания сданы</h2>
          <p className="text-[15px] text-[var(--text-2)]">Сайт откроет твои файлы и проверит измеряемые аспекты критериев модуля А.</p>
          <div>
            <Button size="lg" onClick={check} disabled={checking || !attemptId}>
              {checking ? "Проверяю файлы…" : "Проверить"}
            </Button>
          </div>
        </section>
      )}
      {!report && readOnly && <p className="text-[14px] text-[var(--text-2)]">Автопроверку ещё не запускали.</p>}

      {report && score && (
        <>
          <section className="surface-card flex flex-col gap-2 p-4">
            <p className="text-[13px] font-medium text-[var(--text-3)]">Измеряемые аспекты (автопроверка + самопроверка)</p>
            <p className="font-display text-[30px] font-bold leading-tight text-[var(--text)]">
              {score.got} <span className="text-[18px] text-[var(--text-3)]">из {score.max}</span>
            </p>
            <p className="text-[14px] text-[var(--text-2)]">
              Ещё {A_JUDGED} судейских баллов (качество регламента, сетки, дизайн и содержание презентации, заявка) оценит тренер. Всего в модуле — {A_TOTAL}.
              {score.unknown > 0 && ` ${score.unknown} балла не проверены автоматически (PDF) — посмотри сам.`}
            </p>
            {!readOnly && <p className="text-[14px] text-[var(--text-2)]">Посмотри разбор, отметь самопроверку и нажми «Сдать на проверку» внизу страницы.</p>}
          </section>

          {report.parts.map((p) => (
            <section key={p.stage} className="surface-card flex flex-col gap-3 p-4">
              <h3 className="text-[17px]">{p.title}</h3>
              <ul className="flex flex-col gap-2">
                {p.aspects.map((a) => {
                  const selfItem = A_SELF.find((s) => s.id === a.id);
                  const got = selfItem ? (self[selfItem.key] ? a.weight : 0) : a.got;
                  return (
                    <li key={a.id} className="flex flex-col gap-1 rounded-[var(--radius-control)] bg-[var(--surface-muted)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[14px] font-medium text-[var(--text)]">
                          {a.id} · {a.title}
                        </span>
                        <Badge variant={got === null ? "warning" : got >= a.weight ? "success" : "danger"}>
                          {got === null ? "проверь сам" : `${got} / ${a.weight}`}
                        </Badge>
                      </div>
                      {selfItem ? (
                        <label className="flex items-start gap-2 text-[14px] text-[var(--text-2)]">
                          <input type="checkbox" className="mt-1" checked={!!w[selfItem.key]} disabled={readOnly} onChange={(e) => set({ [selfItem.key]: e.target.checked })} />
                          <span>Самопроверка: {selfItem.hint}</span>
                        </label>
                      ) : (
                        <p className="text-[14px] text-[var(--text-2)]">{a.note}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
              {p.extra.length > 0 && (
                <>
                  <p className="text-[13px] font-medium text-[var(--text-3)]">Что ещё нашёл разбор (влияет на судейскую оценку)</p>
                  <ul className="flex flex-col gap-1 text-[14px]">
                    {p.extra.map((e) => (
                      <li key={e.text} className={e.ok ? "text-[var(--success-ink)]" : "text-[var(--danger)]"}>
                        {e.ok ? "✓" : "✗"} {e.text}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          ))}

          <section className="surface-card flex flex-col gap-3 p-4">
            <h3 className="text-[17px]">5. Охрана труда и бережливое производство</h3>
            {A_SELF.filter((s) => s.id.startsWith("a5")).map((s) => (
              <label key={s.key} className="flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--surface-muted)] p-3 text-[14px] text-[var(--text-2)]">
                <input type="checkbox" className="mt-1" checked={!!w[s.key]} disabled={readOnly} onChange={(e) => set({ [s.key]: e.target.checked })} />
                <span>
                  <b className="text-[var(--text)]">
                    {s.id} · {s.title} ({s.weight})
                  </b>
                  <br />
                  {s.hint}
                </span>
              </label>
            ))}
          </section>

          <section className="surface-card flex flex-col gap-2 p-4">
            <h3 className="text-[17px]">Сверка между файлами</h3>
            <ul className="flex flex-col gap-1 text-[14px]">
              {report.cross.map((c) => (
                <li key={c.text} className={c.ok ? "text-[var(--success-ink)]" : "text-[var(--danger)]"}>
                  {c.ok ? "✓" : "✗"} {c.text}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
