"use client";

/*
 * Тренер: оценка попытки по аспектам критериев.
 * Измеримый аспект — «выполнен / нет» (или частичные баллы, если снимали за нарушения).
 * Судейский — оценка 0–3, баллы = вес × оценка / 3.
 * Можно вставить готовую оценку одним блоком JSON (например, от Claude после проверки файлов).
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CriteriaTask } from "@/lib/poligon/types";
import { aspectPoints, fmtPoints, taskResults, totalOf, type ScoresMap } from "@/lib/poligon/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { confirmAction } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";

type Summary = { good: string; improve: string; nextSteps: string };

export function GradeForm({
  attemptId,
  tasks,
  initialScores,
  initialSummary,
  published,
}: {
  attemptId: string;
  tasks: CriteriaTask[];
  initialScores: ScoresMap;
  initialSummary: Summary;
  published: boolean;
}) {
  const router = useRouter();
  const [scores, setScores] = useState<ScoresMap>(initialScores);
  const [summary, setSummary] = useState<Summary>(initialSummary);
  const [busy, setBusy] = useState(false);
  const [json, setJson] = useState("");

  const total = useMemo(() => totalOf(taskResults(tasks, scores)), [tasks, scores]);

  function setValue(id: string, value: number | null) {
    setScores((s) => ({ ...s, [id]: { value, comment: s[id]?.comment ?? "" } }));
  }
  function setComment(id: string, comment: string) {
    setScores((s) => ({ ...s, [id]: { value: s[id]?.value ?? null, comment } }));
  }

  /** Вставка JSON: { scores: { "b1-1": { value, comment } }, good, improve, nextSteps } */
  function importJson() {
    try {
      const data = JSON.parse(json) as Partial<Summary> & { scores?: ScoresMap };
      if (data.scores) setScores((s) => ({ ...s, ...data.scores }));
      setSummary((s) => ({
        good: data.good ?? s.good,
        improve: data.improve ?? s.improve,
        nextSteps: data.nextSteps ?? s.nextSteps,
      }));
      setJson("");
      toast.success("Оценки вставлены — проверь и сохрани");
    } catch {
      toast.error("Это не похоже на JSON. Скопируй блок целиком.");
    }
  }

  async function save(publish: boolean) {
    if (publish) {
      const missing = tasks.flatMap((t) => t.aspects).filter((a) => scores[a.id]?.value == null).length;
      const ok = await confirmAction(
        missing
          ? `Не оценено аспектов: ${missing}. Всё равно открыть отчёт ученику? Ему придёт сообщение в Telegram.`
          : "Открыть отчёт ученику? Ему придёт сообщение в Telegram.",
        { confirmLabel: "Открыть" }
      );
      if (!ok) return;
    }
    setBusy(true);
    const res = await fetch(`/api/admin/poligon/attempts/${attemptId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scores, ...summary, publish }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast.error("Не получилось сохранить");
    toast.success(publish ? "Отчёт открыт ученику" : "Сохранено");
    router.refresh();
  }

  async function remove() {
    if (!(await confirmAction("Удалить попытку целиком? Это нельзя отменить."))) return;
    const res = await fetch(`/api/admin/poligon/attempts/${attemptId}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) return toast.error("Не получилось удалить");
    router.push("/admin/poligon");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="surface-card sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <span className="font-mono-num text-[22px] font-bold text-[var(--text)]">
          {fmtPoints(total.points)} / {fmtPoints(total.max)}
        </span>
        <span className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => save(false)} disabled={busy}>
            Сохранить
          </Button>
          <Button variant="admin" onClick={() => save(true)} disabled={busy}>
            {published ? "Обновить отчёт ученику" : "Открыть ученику"}
          </Button>
        </span>
      </div>

      <details className="surface-card p-4">
        <summary className="cursor-pointer text-[15px] font-medium text-[var(--text)]">Вставить готовую оценку (JSON)</summary>
        <Textarea className="mt-2 font-mono text-[13px]" rows={6} value={json} onChange={(e) => setJson(e.target.value)} />
        <Button className="mt-2" size="sm" variant="outline" onClick={importJson} disabled={!json.trim()}>
          Заполнить форму
        </Button>
      </details>

      {tasks.map((t) => {
        const r = taskResults([t], scores)[0];
        return (
          <section key={t.id} className="surface-card p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-display text-[16px] font-semibold text-[var(--text)]">{t.title}</h3>
              <span className="font-mono-num text-[15px] font-semibold">
                {fmtPoints(r.points)} / {fmtPoints(r.max)}
              </span>
            </div>
            <ul className="flex flex-col gap-4">
              {t.aspects.map((a) => {
                const s = scores[a.id];
                const p = aspectPoints(a, s);
                return (
                  <li key={a.id} className="border-t border-[var(--border-soft)] pt-3 first:border-0 first:pt-0">
                    <div className="mb-1.5 flex items-start justify-between gap-3">
                      <span className="text-[14px] text-[var(--text)]">
                        <span className="mr-1 font-mono text-[12px] text-[var(--text-3)]">{a.id}</span>
                        {a.title}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <Badge variant={a.type === "I" ? "default" : "admin"}>{a.type === "I" ? "И" : "С"}</Badge>
                        <span className="font-mono-num text-[13px]">
                          {p === null ? "—" : fmtPoints(p)} / {fmtPoints(a.weight)}
                        </span>
                      </span>
                    </div>
                    {a.method && <p className="mb-1.5 text-[12px] text-[var(--text-3)]">Как проверять: {a.method}</p>}

                    {a.type === "I" ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" variant={s?.value === a.weight ? "success" : "outline"} onClick={() => setValue(a.id, a.weight)}>
                          Выполнено
                        </Button>
                        <Button size="sm" variant={s?.value === 0 ? "destructive" : "outline"} onClick={() => setValue(a.id, 0)}>
                          Нет — 0
                        </Button>
                        <Input
                          type="number"
                          step="0.25"
                          min={0}
                          max={a.weight}
                          className="h-9 w-24"
                          value={s?.value ?? ""}
                          onChange={(e) => setValue(a.id, e.target.value === "" ? null : Number(e.target.value))}
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex gap-1.5">
                          {[0, 1, 2, 3].map((g) => (
                            <Button
                              key={g}
                              size="sm"
                              variant={s?.value === g ? "admin" : "outline"}
                              onClick={() => setValue(a.id, g)}
                              title={a.levels?.[g]}
                            >
                              {g}
                            </Button>
                          ))}
                        </div>
                        {a.levels && s?.value != null && (
                          <p className="text-[13px] text-[var(--text-2)]">{a.levels[Math.round(s.value)]}</p>
                        )}
                      </div>
                    )}
                    <Input
                      className={cn("mt-2 h-9 text-[14px]")}
                      placeholder="Комментарий для ученика: что не так и как исправить"
                      value={s?.comment ?? ""}
                      onChange={(e) => setComment(a.id, e.target.value)}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <section className="surface-card flex flex-col gap-3 p-4">
        <h3 className="text-[16px]">Итог для ученика</h3>
        <label className="text-[13px] font-medium text-[var(--text-2)]">
          Что получилось хорошо
          <Textarea className="mt-1" rows={3} value={summary.good} onChange={(e) => setSummary({ ...summary, good: e.target.value })} />
        </label>
        <label className="text-[13px] font-medium text-[var(--text-2)]">
          Что подтянуть
          <Textarea className="mt-1" rows={3} value={summary.improve} onChange={(e) => setSummary({ ...summary, improve: e.target.value })} />
        </label>
        <label className="text-[13px] font-medium text-[var(--text-2)]">
          Что делать дальше
          <Textarea className="mt-1" rows={3} value={summary.nextSteps} onChange={(e) => setSummary({ ...summary, nextSteps: e.target.value })} />
        </label>
      </section>

      <div>
        <Button variant="destructive" size="sm" onClick={remove}>
          Удалить попытку
        </Button>
      </div>
    </div>
  );
}
