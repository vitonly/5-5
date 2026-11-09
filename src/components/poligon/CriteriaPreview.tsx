/*
 * «За что дают баллы» — список заданий и аспектов варианта.
 * Для судейских аспектов показываем, что нужно для оценки 3 и для 2 (оценки эксперта 0–3).
 */
import type { CriteriaTask } from "@/lib/poligon/types";
import { fmtPoints } from "@/lib/poligon/core";
import { Badge } from "@/components/ui/badge";

export function CriteriaPreview({ tasks }: { tasks: CriteriaTask[] }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[14px] text-[var(--text-2)]">
        <b className="text-[var(--text)]">Измеримый</b> аспект — либо выполнен (все баллы), либо нет (0).{" "}
        <b className="text-[var(--text)]">Судейский</b> — эксперт ставит оценку от 0 до 3; баллы = вес × оценка / 3.
      </p>
      {tasks.map((t) => {
        const max = t.aspects.reduce((s, a) => s + a.weight, 0);
        return (
          <section key={t.id} className="surface-card p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="font-display text-[16px] font-semibold text-[var(--text)]">{t.title}</h3>
              <Badge variant="points">{fmtPoints(max)} б.</Badge>
            </div>
            <ul className="flex flex-col gap-2.5">
              {t.aspects.map((a) => (
                <li key={a.id} className="text-[14px] leading-relaxed text-[var(--text-2)]">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-[var(--text)]">{a.title}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <Badge variant={a.type === "I" ? "default" : "admin"}>{a.type === "I" ? "измеримый" : "судейский"}</Badge>
                      <span className="font-mono-num text-[13px] text-[var(--text)]">{fmtPoints(a.weight)}</span>
                    </span>
                  </div>
                  {a.type === "S" && a.levels && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[13px] text-[var(--admin-ink)]">Что нужно на «3» и на «2»</summary>
                      <p className="mt-1">
                        <b className="text-[var(--success-ink)]">Оценка 3 из 3:</b> {a.levels[3]}
                      </p>
                      <p className="mt-1">
                        <b className="text-[var(--warning-ink)]">Оценка 2 из 3:</b> {a.levels[2]}
                      </p>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
