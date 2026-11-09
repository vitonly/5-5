/*
 * Список попыток: ученику — свои, тренеру — с именем ученика.
 */
import Link from "next/link";
import type { PoligonAttempt } from "@prisma/client";
import { POLIGON_MODULES } from "@/content/poligon";
import {
  MODE_LABEL,
  STATUS_LABEL,
  fmtPoints,
  getVariant,
  isModuleCode,
  parseScores,
  taskResults,
  totalOf,
  variantTasks,
} from "@/lib/poligon/core";
import { Badge } from "@/components/ui/badge";

const dateFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Moscow",
});

export function AttemptList({
  attempts,
  hrefBase,
  names,
  showScoreToStudent = true,
}: {
  attempts: PoligonAttempt[];
  /** /poligon/attempt или /admin/poligon/attempt */
  hrefBase: string;
  /** userId → имя (для тренера) */
  names?: Record<string, string>;
  /** Ученик видит баллы, только когда отчёт открыт */
  showScoreToStudent?: boolean;
}) {
  if (!attempts.length) {
    return <p className="text-[14px] text-[var(--text-3)]">Пока попыток нет.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {attempts.map((a) => {
        const mod = POLIGON_MODULES.find((m) => m.code === a.moduleCode);
        const variant = mod ? getVariant(mod, a.variantId) : null;
        let score: string | null = null;
        if (variant && isModuleCode(a.moduleCode) && (a.status === "GRADED" || (names && a.gradedAt))) {
          const t = totalOf(taskResults(variantTasks(a.moduleCode, variant), parseScores(a.scores)));
          if (showScoreToStudent || names) score = `${fmtPoints(t.points)} из ${fmtPoints(t.max)}`;
        }
        const tone = a.status === "GRADED" ? "success" : a.status === "SUBMITTED" ? "warning" : "default";
        return (
          <li key={a.id}>
            <Link
              href={`${hrefBase}/${a.id}`}
              className="surface-card flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:border-[var(--border-field)]"
            >
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-medium text-[var(--text)]">
                  {names ? `${names[a.userId] ?? "Ученик"} · ` : ""}Модуль {mod?.letter ?? "?"} — {variant?.title ?? a.variantId}
                </span>
                <span className="text-[13px] text-[var(--text-3)]">
                  {MODE_LABEL[a.mode] ?? a.mode} · начато {dateFmt.format(a.startedAt)}
                </span>
              </span>
              <span className="flex items-center gap-2">
                {score && <span className="font-mono-num text-[14px] font-semibold text-[var(--text)]">{score}</span>}
                <Badge variant={tone}>{STATUS_LABEL[a.status] ?? a.status}</Badge>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
