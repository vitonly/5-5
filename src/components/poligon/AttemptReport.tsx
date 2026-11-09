/*
 * Отчёт по проверенной попытке: баллы по заданиям и аспектам, комментарии тренера,
 * что получилось, что подтянуть и какие уроки повторить.
 */
import Link from "next/link";
import type { PoligonModule, CriteriaTask } from "@/lib/poligon/types";
import { aspectPoints, fmtPoints, recommendLessons, taskResults, totalOf, type ScoresMap } from "@/lib/poligon/core";
import { StatTile } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function Bar({ share }: { share: number }) {
  const tone = share >= 0.8 ? "bg-[var(--success)]" : share >= 0.5 ? "bg-[var(--warning)]" : "bg-[var(--danger)]";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--control)]">
      <div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.round(share * 100)}%` }} />
    </div>
  );
}

function Paragraphs({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-1.5 text-[15px] leading-relaxed text-[var(--text)]">
      {text
        .split("\n")
        .filter((l) => l.trim())
        .map((l, i) => (
          <p key={i}>{l}</p>
        ))}
    </div>
  );
}

export function AttemptReport({
  module,
  tasks,
  scores,
  good,
  improve,
  nextSteps,
  overtime,
}: {
  module: PoligonModule;
  tasks: CriteriaTask[];
  scores: ScoresMap;
  good: string;
  improve: string;
  nextSteps: string;
  overtime: number;
}) {
  const results = taskResults(tasks, scores);
  const total = totalOf(results);
  const share = total.max ? total.points / total.max : 0;
  const lessons = recommendLessons(module, tasks, scores);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 min-[720px]:grid-cols-3">
        <StatTile
          label="Баллы"
          value={`${fmtPoints(total.points)} / ${fmtPoints(total.max)}`}
          tone={share >= 0.8 ? "success" : share >= 0.5 ? "warning" : "danger"}
        />
        <StatTile label="Процент" value={`${Math.round(share * 100)}%`} />
        <StatTile
          label="Время"
          value={overtime ? `+${overtime} мин` : "уложился"}
          tone={overtime ? "warning" : "success"}
        />
      </div>

      {good && (
        <section className="rounded-[var(--radius-card)] border border-[var(--success-border)] bg-[var(--success-bg)] p-4">
          <h2 className="mb-2 text-[17px] text-[var(--success-ink)]">Что получилось хорошо</h2>
          <Paragraphs text={good} />
        </section>
      )}
      {improve && (
        <section className="rounded-[var(--radius-card)] border border-[var(--warning-border)] bg-[var(--warning-bg)] p-4">
          <h2 className="mb-2 text-[17px] text-[var(--warning-ink)]">Что подтянуть</h2>
          <Paragraphs text={improve} />
        </section>
      )}
      {(nextSteps || lessons.length > 0) && (
        <section className="surface-card p-4">
          <h2 className="mb-2 text-[17px]">Что делать дальше</h2>
          {nextSteps && <Paragraphs text={nextSteps} />}
          {lessons.length > 0 && (
            <>
              <p className="mt-3 text-[13px] font-semibold text-[var(--text-2)]">Повтори уроки — там, где потеряны баллы:</p>
              <ul className="mt-1 flex flex-col gap-1">
                {lessons.map((l) => (
                  <li key={l.id}>
                    <Link className="text-[15px] font-medium text-[var(--points-ink)] underline" href={`/poligon/${module.code}/learn/${l.id}`}>
                      {l.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <h2 className="mt-2 text-[18px]">Разбор по заданиям</h2>
      {results.map((r) => (
        <section key={r.task.id} className="surface-card p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="font-display text-[16px] font-semibold text-[var(--text)]">{r.task.title}</h3>
            <span className="font-mono-num text-[15px] font-semibold text-[var(--text)]">
              {fmtPoints(r.points)} / {fmtPoints(r.max)}
            </span>
          </div>
          <Bar share={r.max ? r.points / r.max : 0} />
          <ul className="mt-3 flex flex-col gap-2.5">
            {r.task.aspects.map((a) => {
              const s = scores[a.id];
              const p = aspectPoints(a, s);
              const full = p !== null && p >= a.weight - 0.001;
              return (
                <li key={a.id} className="text-[14px] leading-relaxed">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-[var(--text)]">
                      {full ? "✅ " : p === null ? "⏳ " : p > 0 ? "🟡 " : "❌ "}
                      {a.title}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {a.type === "S" && s?.value !== null && s?.value !== undefined && (
                        <Badge variant="admin">оценка {Math.round(s.value)} из 3</Badge>
                      )}
                      <span className="font-mono-num text-[13px] text-[var(--text)]">
                        {p === null ? "—" : fmtPoints(p)} / {fmtPoints(a.weight)}
                      </span>
                    </span>
                  </div>
                  {s?.comment && <p className="mt-0.5 pl-6 text-[var(--text-2)]">{s.comment}</p>}
                  {a.type === "S" && a.levels && !full && p !== null && (
                    <details className="mt-0.5 pl-6">
                      <summary className="cursor-pointer text-[13px] text-[var(--admin-ink)]">Как получить 3 из 3</summary>
                      <p className="mt-1 text-[var(--text-2)]">{a.levels[3]}</p>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
