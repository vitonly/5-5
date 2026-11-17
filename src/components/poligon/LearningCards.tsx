import Link from "next/link";
import type { Lesson, ModuleCode, Variant } from "@/lib/poligon/types";
import { fmtMinutes, fmtPoints, maxPoints, variantTasks } from "@/lib/poligon/core";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Общие карточки всех модулей: ученик узнаёт знакомый интерфейс. */
export function VariantGrid({ variants, code }: { variants: Variant[]; code: ModuleCode }) {
  return (
    <div className="grid gap-3 min-[720px]:grid-cols-2">
      {variants.map((v) => (
        <Link key={v.id} href={`/poligon/${code}/test/${v.id}`} className="surface-card flex min-w-0 flex-col gap-2 p-4 hover:border-[var(--border-field)]">
          <span className="flex flex-wrap gap-1.5">
            <Badge variant={v.kind === "championship" ? "danger" : v.kind === "trainer" ? "points" : "default"}>
              {v.kind === "championship" ? "Как на чемпионате · жёсткий таймер" : v.kind === "trainer" ? "Тренажёр · разбор сразу" : "Тренировка с файлами"}
            </Badge>
            <Badge>{fmtMinutes(v.minutes)}</Badge>
            <Badge variant="points">{fmtPoints(maxPoints(variantTasks(code, v)))} б.</Badge>
          </span>
          <span className="font-display text-[17px] font-semibold text-[var(--text)]">{v.title}</span>
          <span className="text-[14px] text-[var(--text-2)]">{v.summary}</span>
        </Link>
      ))}
    </div>
  );
}

/** Сквозная нумерация не сбрасывается между заданиями модуля. */
export function LessonList({ lessons, code, doneIds, startNumber = 1 }: {
  lessons: Lesson[];
  code: ModuleCode;
  doneIds: string[];
  startNumber?: number;
}) {
  const done = new Set(doneIds);
  return (
    <ol start={startNumber} className="flex flex-col gap-2">
      {lessons.map((lesson, index) => (
        <li key={lesson.id}>
          <Link href={`/poligon/${code}/learn/${lesson.id}`} className="surface-card flex items-center gap-3 px-4 py-3 hover:border-[var(--border-field)]">
            <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full font-mono-num text-[14px] font-semibold", done.has(lesson.id) ? "bg-[var(--success-bg)] text-[var(--success-ink)]" : "bg-[var(--control)] text-[var(--text-2)]")}>
              {done.has(lesson.id) ? "✓" : index + startNumber}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium text-[var(--text)]">{lesson.title}</span>
              <span className="block text-[13px] text-[var(--text-3)]">{lesson.summary}</span>
            </span>
            <span className="shrink-0 text-[13px] text-[var(--text-3)]">{lesson.minutes} мин</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
