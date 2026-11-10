"use client";

/*
 * Тренажёры модуля В: симулятор неисправностей, командная строка,
 * пути в Windows и разъёмы, акт и отчёт. Проверка — кнопкой «Показать разбор».
 */
import { useEffect, useRef, useState } from "react";
import type { ReviewCard, Workbook } from "@/lib/poligon/a-practicum";
import type { ConnectorId } from "@/lib/poligon/types";
import {
  ACT_ROWS,
  CMD,
  CONNECTOR_QUIZ,
  DOCS_DATA,
  DOCS_JOURNAL,
  PATHS,
  REPORT_FIELDS,
  SIM,
  reviewCmd,
  reviewDocs,
  reviewSim,
  reviewWhere,
  simState,
  type SimState,
} from "@/lib/poligon/v-trainers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConnectorPic, CONNECTOR_INFO } from "../Figures";
import { ReviewList } from "./APracticum";
import { cn } from "@/lib/utils";

type VId = "v-sim" | "v-cmd" | "v-where" | "v-docs";
const box = "flex flex-col gap-2 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-muted)] p-3";
const field = "flex flex-col gap-1 text-[14px] text-[var(--text-2)]";
const select = "h-9 rounded-[var(--radius-control)] border border-[var(--border-field)] bg-[var(--surface)] px-2 text-[14px] text-[var(--text)]";
const CON_NAMES = Object.fromEntries(Object.entries(CONNECTOR_INFO).map(([k, v]) => [k, v.name])) as Record<ConnectorId, string>;

/** Перемешивание «с зерном»: одинаковое на сервере и в браузере, но не по порядку правильных ответов */
function seeded<T>(arr: T[], seed: string): T[] {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) >>> 0;
    const j = h % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function review(id: VId, w: Workbook): ReviewCard[] {
  if (id === "v-sim") return reviewSim(w);
  if (id === "v-cmd") return reviewCmd(w);
  if (id === "v-where") return reviewWhere(w, CON_NAMES);
  return reviewDocs(w);
}

function Console({ lines }: { lines: string[] }) {
  return (
    <pre className="overflow-x-auto rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-[12.5px] leading-relaxed text-[var(--text)]">
      {lines.join("\n")}
    </pre>
  );
}

export function VTrainer({
  id,
  initial,
  readOnly = false,
  onChange,
}: {
  id: VId;
  initial: Workbook;
  readOnly?: boolean;
  onChange?: (w: Workbook) => void;
}) {
  const [w, setW] = useState<Workbook>(initial);
  const [rev, setRev] = useState<ReviewCard[] | null>(readOnly ? review(id, initial) : null);
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
      {id === "v-sim" && <Sim w={w} set={set} readOnly={readOnly} />}

      {id === "v-cmd" && (
        <section className="surface-card flex flex-col gap-3 p-4">
          <h2 className="text-[18px]">Командная строка</h2>
          {CMD.map((t) => (
            <div key={t.id} className={box}>
              {t.kind === "read" && <Console lines={t.output} />}
              <label className={field}>
                {t.q}
                <Input className="font-mono" value={s(t.id)} onChange={(e) => set(t.id, e.target.value)} disabled={readOnly} />
              </label>
            </div>
          ))}
        </section>
      )}

      {id === "v-where" && (
        <>
          <section className="surface-card flex flex-col gap-3 p-4">
            <h2 className="text-[18px]">Пути в Windows 11 — нажимай шаги по порядку</h2>
            {PATHS.map((p) => {
              const picked = s(`path_${p.id}`) ? s(`path_${p.id}`).split(" → ") : [];
              const left = seeded(p.steps, p.id).filter((x) => !picked.includes(x));
              return (
                <div key={p.id} className={box}>
                  <p className="text-[15px] font-semibold text-[var(--text)]">{p.title}</p>
                  <p className="min-h-6 text-[14px] text-[var(--points-ink)]">{picked.join(" → ") || "…"}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {left.map((x) => (
                      <Button key={x} size="sm" variant="outline" disabled={readOnly} onClick={() => set(`path_${p.id}`, [...picked, x].join(" → "))}>
                        {x}
                      </Button>
                    ))}
                    {picked.length > 0 && !readOnly && (
                      <Button size="sm" variant="ghost" onClick={() => set(`path_${p.id}`, "")}>
                        Сбросить
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
          <section className="surface-card flex flex-col gap-3 p-4">
            <h2 className="text-[18px]">Что это за разъём?</h2>
            <div className="grid gap-3 min-[640px]:grid-cols-2">
              {seeded(CONNECTOR_QUIZ, "con").map((cid) => (
                <div key={cid} className={cn(box, "items-center")}>
                  <ConnectorPic id={cid} size={120} />
                  <select className={cn(select, "w-full")} value={s(`con_${cid}`)} onChange={(e) => set(`con_${cid}`, e.target.value)} disabled={readOnly} aria-label="Название разъёма">
                    <option value="">— выбери —</option>
                    {CONNECTOR_QUIZ.map((o) => (
                      <option key={o} value={o}>
                        {CON_NAMES[o]}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {id === "v-docs" && (
        <>
          <section className="surface-card flex flex-col gap-2 p-4">
            <h2 className="text-[18px]">Данные рабочего места № 7</h2>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-[14px] text-[var(--text)]">
              {DOCS_DATA.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
            <h3 className="mt-2 text-[16px]">Журнал неисправности</h3>
            <ul className="flex flex-col gap-1 font-mono text-[13px] text-[var(--text)]">
              {DOCS_JOURNAL.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </section>
          <section className="surface-card flex flex-col gap-3 p-4">
            <h2 className="text-[18px]">Акт (Приложение 8) — строки</h2>
            {ACT_ROWS.map((r) => (
              <div key={r.id} className={box}>
                <p className="text-[14px] text-[var(--text)]">
                  <b>{r.row}</b> · норма: {r.norm}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Input className="min-w-0 flex-1" placeholder="Фактическое состояние" value={s(`${r.id}f`)} onChange={(e) => set(`${r.id}f`, e.target.value)} disabled={readOnly} />
                  <select className={select} value={s(`${r.id}m`)} onChange={(e) => set(`${r.id}m`, e.target.value)} disabled={readOnly} aria-label={`Отметка ${r.row}`}>
                    <option value="">Отметка</option>
                    <option>ОК</option>
                    <option>Не ОК</option>
                  </select>
                </div>
              </div>
            ))}
            <label className={field}>
              Выявленные недостатки
              <Textarea rows={2} value={s("a_defects")} onChange={(e) => set("a_defects", e.target.value)} disabled={readOnly} />
            </label>
            <label className={field}>
              Рекомендации по устранению
              <Textarea rows={2} value={s("a_recs")} onChange={(e) => set("a_recs", e.target.value)} disabled={readOnly} />
            </label>
            <label className={field}>
              Заключение: рабочее место …
              <select className={select} value={s("a_concl")} onChange={(e) => set("a_concl", e.target.value)} disabled={readOnly}>
                <option value="">— выбери —</option>
                <option value="готово">готово к эксплуатации</option>
                <option value="не готово">не готово к эксплуатации</option>
              </select>
            </label>
          </section>
          <section className="surface-card flex flex-col gap-3 p-4">
            <h2 className="text-[18px]">Отчёт о неисправности (Приложение 7)</h2>
            <div className="grid gap-2 min-[640px]:grid-cols-2">
              {REPORT_FIELDS.map((f) => (
                <label key={f.id} className={field}>
                  {f.label}
                  {f.id.startsWith("r_") && ["r_start", "r_found", "r_fixed", "r_total"].includes(f.id) ? (
                    <Input value={s(f.id)} onChange={(e) => set(f.id, e.target.value)} disabled={readOnly} />
                  ) : (
                    <Textarea rows={2} value={s(f.id)} onChange={(e) => set(f.id, e.target.value)} disabled={readOnly} />
                  )}
                </label>
              ))}
            </div>
          </section>
        </>
      )}

      <section className="surface-card flex flex-col gap-3 p-4">
        <h2 className="text-[18px]">Разбор</h2>
        <div>
          <Button onClick={() => setRev(review(id, w))}>{rev ? "Обновить разбор" : "Показать разбор"}</Button>
        </div>
        {rev && <ReviewList cards={rev} />}
      </section>
    </div>
  );
}

/* ---------- Симулятор ---------- */

function Sim({ w, set, readOnly }: { w: Workbook; set: (k: string, v: string) => void; readOnly: boolean }) {
  const [open, setOpen] = useState(SIM[0].id);
  const sc = SIM.find((x) => x.id === open)!;
  const st = simState(w, sc.id);
  const save = (next: SimState) => set(`sim_${sc.id}`, JSON.stringify(next));

  function pick(stepId: string) {
    const step = sc.steps.find((x) => x.id === stepId)!;
    // Время берём в момент клика (это обработчик события, а не отрисовка)
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const next: SimState = { ...st, log: [...st.log, stepId], startMs: st.startMs ?? now };
    // Работа с кабелями или внутри корпуса без обесточивания — нарушение охраны труда
    if (step.needsPowerOff && !st.log.includes("poweroff")) next.unsafe = true;
    if (step.kind === "fix") {
      if (step.correct) {
        next.solved = true;
        next.endMs = now;
      } else next.wrongFixes = st.wrongFixes + 1;
    }
    save(next);
  }

  return (
    <section className="surface-card flex flex-col gap-3 p-4">
      <h2 className="text-[18px]">Симулятор неисправностей</h2>
      <div className="flex flex-wrap gap-1.5">
        {SIM.map((x) => {
          const xs = simState(w, x.id);
          return (
            <Button key={x.id} size="sm" variant={x.id === open ? "default" : xs.solved ? "success" : "outline"} onClick={() => setOpen(x.id)}>
              {xs.solved ? "✓ " : ""}
              {x.title}
            </Button>
          );
        })}
      </div>

      <div className={box}>
        <p className="text-[15px] font-semibold text-[var(--text)]">Симптом</p>
        <p className="text-[15px] text-[var(--text)]">{sc.symptom}</p>
      </div>

      {st.log.length > 0 && (
        <ol className="flex flex-col gap-2">
          {st.log.map((sid, i) => {
            const step = sc.steps.find((x) => x.id === sid)!;
            const isConsole = step.result[0]?.startsWith("C:\\");
            return (
              <li key={i} className="flex flex-col gap-1">
                <span className="text-[13px] font-semibold text-[var(--text-2)]">
                  {i + 1}. {step.label}
                  {step.kind === "fix" && (step.correct ? " — ✓ исправлено" : " — ✗ не помогло")}
                </span>
                {isConsole ? (
                  <Console lines={step.result} />
                ) : (
                  <p className="rounded-[var(--radius-control)] bg-[var(--surface)] px-3 py-1.5 text-[14px] text-[var(--text)]">{step.result.join(" ")}</p>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {st.solved ? (
        <div className="rounded-[var(--radius-control)] border border-[var(--success-border)] bg-[var(--success-bg)] px-3 py-2 text-[14px] text-[var(--text)]">
          <b>Причина:</b> {sc.cause}
          {st.unsafe && <p className="mt-1 text-[var(--danger)]">Ты работал с кабелями или внутри корпуса, не обесточив ПК, — на площадке это нарушение охраны труда.</p>}
        </div>
      ) : (
        !readOnly && (
          <div className="flex flex-col gap-2">
            {(["check", "util", "fix"] as const).map((kind) => (
              <div key={kind}>
                <p className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-[var(--text-3)]">
                  {kind === "check" ? "Посмотреть" : kind === "util" ? "Утилиты" : "Исправить"}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {seeded(
                    sc.steps.filter((x) => x.kind === kind),
                    sc.id + kind
                  ).map((x) => (
                    <Button key={x.id} size="sm" variant={kind === "fix" ? "secondary" : "outline"} disabled={st.log.includes(x.id)} onClick={() => pick(x.id)}>
                      {x.label}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {st.log.length > 0 && !readOnly && (
        <div>
          <Button size="sm" variant="ghost" onClick={() => set(`sim_${sc.id}`, "")}>
            Пройти сценарий заново
          </Button>
        </div>
      )}
    </section>
  );
}
