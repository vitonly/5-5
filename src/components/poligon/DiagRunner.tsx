"use client";

/*
 * Входная диагностика: все разделы на одной странице.
 * Ответы сохраняются на сервер сами (через пару секунд после ввода), можно уйти и вернуться.
 * Правильных ответов в браузере нет — проверяет сервер и тренер.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DIAG_ITEMS,
  DIAG_SCALE_LEGEND,
  DIAG_SECTIONS,
  isDiagAnswered,
  type DiagAnswer,
  type DiagAnswers,
  type DiagItem,
} from "@/content/poligon/diag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { confirmAction } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";

type SaveState = "idle" | "saving" | "saved" | "error";

export function DiagRunner({ initial }: { initial: DiagAnswers }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<DiagAnswers>(initial);
  const [save, setSave] = useState<SaveState>("idle");
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(answers);

  /** Отправить черновик на сервер */
  async function pushDraft() {
    setSave("saving");
    const res = await fetch("/api/poligon/diag", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: latest.current }),
    }).catch(() => null);
    setSave(res?.ok ? "saved" : "error");
  }

  /** Записать ответ и через 1,5 секунды сохранить (чтобы не слать запрос на каждую букву) */
  function setAnswer(id: string, v: DiagAnswer) {
    setAnswers((a) => {
      const next = { ...a, [id]: v };
      latest.current = next;
      return next;
    });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(pushDraft, 1500);
  }

  // Уходя со страницы, не теряем таймер сохранения
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const done = DIAG_ITEMS.filter((it) => isDiagAnswered(it, answers[it.id])).length;
  const total = DIAG_ITEMS.length;

  async function submit() {
    const left = total - done;
    const ok = await confirmAction(
      `${left ? `Без ответа: ${left}. ` : ""}Отправить тест? После отправки ответы уже не изменить.`,
      { confirmLabel: "Отправить" }
    );
    if (!ok) return;
    if (timer.current) clearTimeout(timer.current);
    setBusy(true);
    const res = await fetch("/api/poligon/diag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: latest.current }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast.error("Не получилось отправить. Проверь интернет и нажми ещё раз.");
    toast.success("Тест отправлен");
    window.scrollTo({ top: 0, behavior: "smooth" });
    router.refresh();
  }

  // Сквозная нумерация вопросов внутри раздела: «А-1», «Б-3»…
  return (
    <div className="flex flex-col gap-8 pb-28">
      <nav className="flex flex-wrap gap-1.5" aria-label="Разделы">
        {DIAG_SECTIONS.map((s, i) => {
          const items = s.items.filter((x) => x.t !== "table");
          const all = items.every((x) => isDiagAnswered(x, answers[x.id]));
          return (
            <a
              key={s.code}
              href={`#diag-${i}`}
              className={cn(
                "rounded-full border px-3 py-1 text-[13px]",
                all ? "border-[var(--success)] text-[var(--success-ink)]" : "border-[var(--border)] text-[var(--text-2)]"
              )}
            >
              {s.code} · {s.title}
            </a>
          );
        })}
      </nav>

      {DIAG_SECTIONS.map((s, si) => {
        let n = 0;
        return (
          <section key={s.code} id={`diag-${si}`} className="scroll-mt-20">
            <div className="mb-3 flex items-baseline gap-3 border-b-2 border-[var(--text)] pb-2">
              <span className="font-display text-[24px] font-bold text-[var(--points-ink)]">{s.code}</span>
              <h2 className="text-[18px]">{s.title}</h2>
              <span className="ml-auto text-[12px] text-[var(--text-3)]">{s.meta}</span>
            </div>
            <div className="flex flex-col gap-3">
              {s.items.map((it) => {
                const label = it.t === "table" || s.code === "0" ? "" : `${s.code}-${++n}`;
                return (
                  <Question
                    key={it.id}
                    item={it}
                    label={label}
                    value={answers[it.id]}
                    onChange={(v) => setAnswer(it.id, v)}
                  />
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Нижняя панель: прогресс, статус сохранения, отправка */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div className="mx-auto flex max-w-[760px] flex-wrap items-center gap-3">
          <div className="min-w-[180px] flex-1">
            <div className="flex justify-between gap-2 text-[13px] text-[var(--text-2)]">
              <span>
                Отвечено {done} из {total}
              </span>
              <span>
                {save === "saving" && "сохраняю…"}
                {save === "saved" && "сохранено"}
                {save === "error" && <span className="text-[var(--danger)]">не сохранилось — повторю при следующем ответе</span>}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
              <div className="h-full bg-[var(--points-ink)] transition-[width]" style={{ width: `${(done / total) * 100}%` }} />
            </div>
          </div>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Отправляю…" : "Завершить тест"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Один вопрос любого типа */
function Question({
  item,
  label,
  value,
  onChange,
}: {
  item: DiagItem;
  label: string;
  value: DiagAnswer | undefined;
  onChange: (v: DiagAnswer) => void;
}) {
  const answered = item.t !== "table" && isDiagAnswered(item, value);
  return (
    <div className={cn("surface-card flex flex-col gap-3 p-4", answered && "border-[var(--success-border)]")}>
      <div className="flex gap-3">
        {label && <span className="min-w-[2.6em] pt-0.5 text-[12px] font-semibold text-[var(--text-3)]">{label}</span>}
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-[var(--text)]">{item.q}</p>
          {"hint" in item && item.hint && <p className="mt-1 text-[13px] text-[var(--text-3)]">{item.hint}</p>}
          {item.t === "multi" && <p className="mt-1 text-[13px] text-[var(--text-3)]">Можно выбрать несколько.</p>}
          {item.t === "scale" && <p className="mt-1 text-[13px] text-[var(--text-3)]">{DIAG_SCALE_LEGEND}</p>}
        </div>
      </div>

      {item.t === "single" && (
        <div className="flex flex-col gap-1.5">
          {item.opts.map((o, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onChange(i)}
              className={cn(
                "rounded-[var(--radius-control)] border px-3 py-2 text-left text-[14px] text-[var(--text)]",
                value === i ? "border-[var(--points-ink)] bg-[var(--points-bg)]" : "border-[var(--border)] hover:border-[var(--border-field)]"
              )}
            >
              {o}
            </button>
          ))}
        </div>
      )}

      {item.t === "multi" && (
        <div className="flex flex-col gap-1.5">
          {item.opts.map((o, i) => {
            const cur = Array.isArray(value) ? value : [];
            const on = cur.includes(i);
            return (
              <label
                key={i}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-[var(--radius-control)] border px-3 py-2 text-[14px] text-[var(--text)]",
                  on ? "border-[var(--points-ink)] bg-[var(--points-bg)]" : "border-[var(--border)] hover:border-[var(--border-field)]"
                )}
              >
                <input
                  type="checkbox"
                  className="mt-1 accent-[var(--points-ink)]"
                  checked={on}
                  onChange={() => onChange(on ? cur.filter((x) => x !== i) : [...cur, i].sort((a, b) => a - b))}
                />
                <span>{o}</span>
              </label>
            );
          })}
        </div>
      )}

      {item.t === "short" && (
        <Input value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} placeholder="Ответ" />
      )}

      {item.t === "text" && (
        <Textarea
          rows={4}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Твой ответ. Не знаешь — так и напиши."
        />
      )}

      {item.t === "table" && (
        <div className="overflow-x-auto">
          <table className="min-w-[560px] border-collapse text-[13px]">
            <thead>
              <tr>
                {item.head.map((h) => (
                  <th key={h} className="border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-1 text-left font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {item.rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    // white-space: pre — чтобы были видны лишние пробелы в «Phoenix  »
                    <td key={ci} className="whitespace-pre border border-[var(--border)] px-2 py-1">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {item.t === "scale" && (
        <div className="flex flex-col">
          {item.rows.map(([k, text]) => {
            const cur = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, number>) : {};
            return (
              <div key={k} className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-[var(--border)] py-2 last:border-0">
                <span className="text-[14px] text-[var(--text)]">{text}</span>
                <span className="flex gap-1" role="radiogroup" aria-label={text}>
                  {[0, 1, 2, 3].map((x) => (
                    <button
                      key={x}
                      type="button"
                      role="radio"
                      aria-checked={cur[k] === x}
                      onClick={() => onChange({ ...cur, [k]: x })}
                      className={cn(
                        "h-8 w-9 rounded-[var(--radius-control)] border text-[13px]",
                        cur[k] === x
                          ? "border-[var(--points-ink)] bg-[var(--points-ink)] text-[var(--surface)]"
                          : "border-[var(--border)] text-[var(--text)] hover:border-[var(--border-field)]"
                      )}
                    >
                      {x}
                    </button>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
