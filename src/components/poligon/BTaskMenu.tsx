import Link from "next/link";
import { CRITERIA } from "@/content/poligon/criteria";
import { B_SKILL_MAPPING } from "@/content/poligon/b-lessons";
import type { PoligonModule } from "@/lib/poligon/types";
import { fmtPoints } from "@/lib/poligon/core";
import { Badge } from "@/components/ui/badge";
import { LessonList, VariantGrid } from "./LearningCards";

const TASK_LABELS: Record<string, string> = {
  b1: "Подготовка данных",
  b2: "Аналитический отчёт",
  b3: "Графики и презентация",
  b4: "Сдача комплекта и работа на площадке",
};

/** Те же карточки и номерные уроки, что в А и В; четыре задания видны сразу. */
export function BTaskMenu({ module: mod, doneIds, tab }: {
  module: PoligonModule;
  doneIds: string[];
  tab: "learn" | "test";
}) {
  const legacyLessons = mod.lessons.filter(l => !l.id.startsWith("b-step-"));
  const course = mod.lessons.filter(l => l.id.startsWith("b-step-"));
  const legacyVariants = mod.variants.filter(v => !v.id.startsWith("b-practice-") && v.id !== "b-official-two-day");
  const trainers = mod.variants.filter(v => v.id.startsWith("b-practice-"));
  const official = mod.variants.filter(v => v.id === "b-official-two-day");
  const done = new Set(doneIds);

  return <div className="flex flex-col gap-6">
    <section aria-labelledby="b-trainers-heading">
      <h2 id="b-trainers-heading" className="mb-2 text-[17px]">{tab === "learn" ? "Тренажёры — по каждому заданию" : "Учебные задания — практика в Excel"}</h2>
      <VariantGrid variants={trainers} code="b" />
    </section>

    {tab === "learn" && <section aria-labelledby="b-lessons-heading" className="flex flex-col gap-5">
      <div>
        <h2 id="b-lessons-heading" className="mb-2 text-[17px]">Уроки</h2>
        <p className="text-[14px] text-[var(--text-2)]">Начни с урока 1. Всего 19 коротких уроков: зачем → маленький пример → кнопки в Excel → самопроверка. Они покрывают все 21 аспект ведомости.</p>
      </div>
      <nav aria-label="Четыре задания модуля Б" className="flex flex-wrap gap-2">
        {CRITERIA.b.tasks.map((task, i) => <Link key={task.id} href={`#${task.id}`} className="inline-flex min-h-11 items-center rounded-[var(--radius-pill)] bg-[var(--control)] px-3 py-2 text-[13px] font-medium text-[var(--text-2)] hover:text-[var(--text)]">{i + 1}. {TASK_LABELS[task.id]}</Link>)}
      </nav>
      {CRITERIA.b.tasks.map((task, index) => {
        const mappings = B_SKILL_MAPPING.filter(m => task.aspects.some(a => a.id === m.aspectId));
        const practice = ["clean", "report", "visual", "delivery"][index];
        const lessons = course.filter(l => l.practiceVariantId === `b-practice-${practice}`);
        const startNumber = course.indexOf(lessons[0]) + 1;
        return <section key={task.id} id={task.id} className="scroll-mt-24">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[16px]">Задание {index + 1}. {TASK_LABELS[task.id]}</h3>
            <span className="flex flex-wrap gap-1.5"><Badge variant="points">{fmtPoints(task.aspects.reduce((sum, a) => sum + a.weight, 0))} б.</Badge><Badge>Прочитано {lessons.filter(l => done.has(l.id)).length} из {lessons.length}</Badge></span>
          </div>
          <LessonList lessons={lessons} code="b" doneIds={doneIds} startNumber={startNumber} />
          <Link href={`/poligon/b/test/b-practice-${practice}`} className="mt-2 inline-flex min-h-11 items-center py-2 text-[14px] font-medium text-[var(--points-ink)] hover:underline">Закрепить задание {index + 1} в тренажёре →</Link>
          <details className="mt-2 text-sm text-[var(--text-2)]"><summary className="min-h-11 cursor-pointer py-2">Какие критерии здесь изучаем</summary><ul>{mappings.map(m => <li key={m.aspectId} className="py-1"><Link className="text-[var(--points-ink)] hover:underline" href={`/poligon/b/learn/${m.lessonId}`}>{m.aspectId.toUpperCase()} — {task.aspects.find(a => a.id === m.aspectId)?.title}</Link></li>)}</ul><p className="mt-2">Баллы за критерий наставник ставит один раз в итоговой работе; упражнения не прибавляют их повторно.</p></details>
        </section>;
      })}
    </section>}

    {tab === "test" && <section aria-labelledby="b-official-heading">
      <h2 id="b-official-heading" className="mb-2 text-[17px]">Официальный прогон — приложение 9</h2>
      <p className="mb-3 text-[14px] text-[var(--text-2)]">Исходный файл прикрепляет наставник. Первый день — 4 часа, второй — 2 часа. Работа сохраняется между днями.</p>
      <VariantGrid variants={official} code="b" />
    </section>}

    <details className="surface-card p-4">
      <summary className="min-h-11 cursor-pointer py-2 text-[15px] font-semibold text-[var(--text)]">Прежние уроки и «Осенний кубок»</summary>
      <p className="my-3 text-[14px] text-[var(--text-2)]">Здесь сохранены прежние уроки, включая справочные примеры приложения 9, и отдельные упражнения фиксированного «Осеннего кубка». Все старые попытки доступны по тем же адресам со своим разбором. Числа разных наборов не смешивай: в новой тренировке считай заново.</p>
      <h3 className="mb-2 text-[15px]">Уроки</h3>
      <LessonList lessons={legacyLessons} code="b" doneIds={doneIds} />
      <h3 className="mb-2 mt-4 text-[15px]">Упражнения</h3>
      <VariantGrid variants={legacyVariants} code="b" />
    </details>
  </div>;
}
