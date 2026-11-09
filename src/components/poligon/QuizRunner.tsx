"use client";

/*
 * Блиц: все вопросы на одной странице, варианты перемешаны.
 * После «Проверить» — результат, объяснения и уроки, которые повторить.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { QuizQuestion } from "@/content/poligon/quiz";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/** Перемешать массив (каждый раз по-новому) */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function QuizRunner({
  moduleCode,
  questions,
  lessonTitles,
}: {
  moduleCode: string;
  questions: QuizQuestion[];
  lessonTitles: Record<string, string>;
}) {
  const router = useRouter();
  // Порядок вопросов и вариантов перемешиваем только в браузере — чтобы сервер и браузер не спорили
  const [order, setOrder] = useState<{ q: QuizQuestion; opts: number[] }[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ correct: number; total: number; wrongIds: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  function restart() {
    setOrder(shuffle(questions).map((q) => ({ q, opts: shuffle(q.options.map((_, i) => i)) })));
    setAnswers({});
    setResult(null);
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect -- перемешивание только на клиенте
  useEffect(restart, [questions]);

  async function submit() {
    const missing = questions.length - Object.keys(answers).length;
    if (missing) return toast.error(`Не отвечено вопросов: ${missing}`);
    setBusy(true);
    const res = await fetch("/api/poligon/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moduleCode, answers }),
    }).catch(() => null);
    setBusy(false);
    const data = await res?.json().catch(() => null);
    if (!res?.ok || !data) return toast.error("Не получилось проверить. Проверь интернет.");
    setResult(data);
    window.scrollTo({ top: 0, behavior: "smooth" });
    router.refresh();
  }

  if (!order) return <p className="text-[14px] text-[var(--text-3)]">Готовим вопросы…</p>;
  const wrong = new Set(result?.wrongIds ?? []);
  const repeat = [...new Set(questions.filter((q) => wrong.has(q.id)).map((q) => q.lessonId))];

  return (
    <div className="flex flex-col gap-4">
      {result && (
        <div
          className={cn(
            "rounded-[var(--radius-card)] border p-4",
            result.correct / result.total >= 0.8
              ? "border-[var(--success-border)] bg-[var(--success-bg)]"
              : "border-[var(--warning-border)] bg-[var(--warning-bg)]"
          )}
        >
          <p className="font-display text-[22px] font-bold text-[var(--text)]">
            {result.correct} из {result.total}
          </p>
          <p className="text-[14px] text-[var(--text-2)]">
            {result.correct === result.total ? "Всё верно. Повтори завтра, чтобы закрепить." : "Ошибки отмечены ниже — с объяснениями."}
          </p>
          {repeat.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 text-[14px]">
              {repeat.map((id) => (
                <li key={id}>
                  Повтори:{" "}
                  <Link className="font-medium text-[var(--points-ink)] underline" href={`/poligon/${moduleCode}/learn/${id}`}>
                    {lessonTitles[id] ?? id}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ol className="flex flex-col gap-3">
        {order.map(({ q, opts }, n) => {
          const picked = answers[q.id];
          const isWrong = result && wrong.has(q.id);
          return (
            <li key={q.id} className="surface-card flex flex-col gap-2 p-4">
              <p className="text-[15px] font-semibold text-[var(--text)]">
                {n + 1}. {q.q}
              </p>
              <div className="flex flex-col gap-1.5">
                {opts.map((i) => {
                  const right = result && i === q.answer;
                  const mine = picked === i;
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={!!result}
                      onClick={() => setAnswers((a) => ({ ...a, [q.id]: i }))}
                      className={cn(
                        "rounded-[var(--radius-control)] border px-3 py-2 text-left text-[14px] text-[var(--text)]",
                        !result && mine && "border-[var(--points-ink)] bg-[var(--points-bg)]",
                        !result && !mine && "border-[var(--border)] hover:border-[var(--border-field)]",
                        right && "border-[var(--success)] bg-[var(--success-bg)]",
                        result && mine && !right && "border-[var(--danger)] bg-[var(--danger-bg)]",
                        result && !mine && !right && "border-[var(--border-soft)] opacity-70"
                      )}
                    >
                      {q.options[i]}
                    </button>
                  );
                })}
              </div>
              {result && (
                <p className={cn("text-[14px]", isWrong ? "text-[var(--danger)]" : "text-[var(--success-ink)]")}>
                  {isWrong ? "Неверно. " : "Верно. "}
                  <span className="text-[var(--text-2)]">{q.why}</span>
                </p>
              )}
            </li>
          );
        })}
      </ol>

      <div className="flex gap-2">
        {result ? (
          <Button onClick={restart}>Пройти ещё раз</Button>
        ) : (
          <Button size="lg" onClick={submit} disabled={busy}>
            {busy ? "Проверяю…" : "Проверить"}
          </Button>
        )}
      </div>
    </div>
  );
}
