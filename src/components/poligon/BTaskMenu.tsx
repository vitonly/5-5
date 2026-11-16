import Link from "next/link";
import { CRITERIA } from "@/content/poligon/criteria";
import { B_SKILL_MAPPING } from "@/content/poligon/b-lessons";
import type { PoligonModule, Variant } from "@/lib/poligon/types";
import { fmtMinutes, fmtPoints } from "@/lib/poligon/core";
import { Badge } from "@/components/ui/badge";

const TASK_LABELS: Record<string, string> = {
  b1: "Подготовить данные",
  b2: "Сделать аналитический отчёт",
  b3: "Построить графики и показать выводы",
  b4: "Организовать место и сдать комплект",
};

/** Отдельный маршрут обучения Б: четыре задания, внутри уроки и практика. */
export function BTaskMenu({
  module: mod,
  doneIds,
  tab,
}: {
  module: PoligonModule;
  doneIds: string[];
  tab: "learn" | "test";
}) {
  const done = new Set(doneIds);
  const legacyLessons = mod.lessons.filter((lesson) => !lesson.id.startsWith("b-skill-"));
  const legacyVariants = mod.variants.filter((variant) => !variant.id.startsWith("b-practice-") && variant.id !== "b-official-two-day");
  const full = mod.variants.find((variant) => variant.id === "b-practice-full");
  const official = mod.variants.find((variant) => variant.id === "b-official-two-day");

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[14px] text-[var(--text-2)]">
        Четыре задания, 21 урок. Внутри каждого — пример, действие в Excel и самопроверка.
        Новая практика выдаёт учебный XLSX после начала попытки. Отметки о прочтении и подсказки помогают учиться;
        официальную оценку по критериям ставит наставник.
      </p>

      {CRITERIA.b.tasks.map((task, index) => {
        const mappings = B_SKILL_MAPPING.filter((item) => task.aspects.some((aspect) => aspect.id === item.aspectId));
        const lessons = mappings.flatMap((item) => mod.lessons.filter((lesson) => lesson.id === item.lessonId));
        const practice = mod.variants.find((variant) => variant.id === mappings[0]?.practiceVariantId);
        const completed = lessons.filter((lesson) => done.has(lesson.id)).length;
        const oldPracticeIds = new Set(mappings.flatMap((item) => item.legacyVariantIds));

        return (
          <details key={task.id} id={task.id} open={index === 0} className="surface-card p-4">
            <summary className="cursor-pointer text-[var(--text)]">
              <span className="text-[16px] font-semibold">{index + 1}. {TASK_LABELS[task.id]}</span>
              <span className="mt-2 flex flex-wrap gap-2">
                <Badge variant="points">{fmtPoints(task.aspects.reduce((sum, aspect) => sum + aspect.weight, 0))} б. по критериям</Badge>
                <Badge>Прочитано {completed} из {lessons.length}</Badge>
              </span>
            </summary>
            <div className="mt-4 flex flex-col gap-4">
              {task.id === "b4" && (
                <p className="text-[13px] text-[var(--text-2)]">
                  Этот балл — за охрану труда и организацию места по наблюдению. Проверка сдачи входит в учебный чек-лист;
                  наличие файлов проверяется также в заданиях 1 и 2.
                </p>
              )}
              {tab === "test" && practice && <PracticeLink variant={practice} />}
              <ol className="flex flex-col gap-3">
                {lessons.map((lesson) => {
                  const mapping = mappings.find((item) => item.lessonId === lesson.id);
                  return (
                    <li key={lesson.id} className="border-t border-[var(--border-soft)] pt-3">
                      <Link href={`/poligon/b/learn/${lesson.id}`} className="block py-1 text-[15px] font-medium text-[var(--text)] hover:underline">
                        {done.has(lesson.id) ? "✓ " : ""}{lesson.title}
                        <span className="ml-2 text-[13px] font-normal text-[var(--text-3)]">{lesson.minutes} мин</span>
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2 text-[13px]">
                        {mapping && (
                          <Link href={`/poligon/b/test/${mapping.practiceVariantId}`} className="py-1 text-[var(--points)] hover:underline">Закрепить в практике →</Link>
                        )}
                        {mapping?.sourceLessonIds.map((id) => {
                          const source = mod.lessons.find((item) => item.id === id);
                          return source ? (
                            <Link key={id} href={`/poligon/b/learn/${id}`} className="py-1 text-[var(--text-2)] hover:underline">Прежний разбор: {source.title}</Link>
                          ) : null;
                        })}
                      </div>
                    </li>
                  );
                })}
              </ol>
              {tab === "learn" && practice && <PracticeLink variant={practice} />}
              <details className="text-[13px] text-[var(--text-2)]">
                <summary className="cursor-pointer py-2">Прежние упражнения по этому заданию</summary>
                <ul className="mt-1 flex flex-col gap-1">
                  {legacyVariants.filter((variant) => oldPracticeIds.has(variant.id)).map((variant) => (
                    <li key={variant.id}><Link href={`/poligon/b/test/${variant.id}`} className="inline-block py-2 hover:underline">{variant.title}</Link></li>
                  ))}
                </ul>
              </details>
            </div>
          </details>
        );
      })}

      {full && (
        <section aria-label="Полная учебная практика" className="surface-card p-4">
          <PracticeLink variant={full} />
          <p className="mt-2 text-[13px] text-[var(--text-2)]">Мягкие 6 часов: можно сохранить работу и продолжить ту же попытку на второй день. Новый набор данных относится только к этой попытке.</p>
        </section>
      )}

      {official && (
        <section aria-label="Официальный прогон" className="surface-card p-4">
          <h2 className="mb-2 text-[17px]">Официальное Приложение 9</h2>
          <p className="mb-3 text-[14px] text-[var(--text-2)]">Исходник выдаёт наставник. Два строгих этапа: 4 часа + 2 часа. Числа примеров в уроках относятся к этому разбору и не заменяют расчёт учебных наборов.</p>
          <Link href={`/poligon/b/test/${official.id}`} className="inline-block py-2 font-medium text-[var(--points)] hover:underline">{official.title} →</Link>
        </section>
      )}

      <details className="surface-card p-4">
        <summary className="cursor-pointer py-1 text-[16px] font-semibold text-[var(--text)]">Архив прежних уроков и упражнений</summary>
        <p className="mt-3 text-[14px] text-[var(--text-2)]">«Осенний кубок СТАРТ+» — прежний фиксированный учебный набор со своим разбором. Его ответы не подходят к новым XLSX и Приложению 9. Старые адреса и попытки сохранены.</p>
        <h3 className="mb-2 mt-4 text-[15px]">Прежние уроки · «Осенний кубок»</h3>
        <ul className="flex flex-col gap-1 text-[14px]">
          {legacyLessons.map((lesson) => (
            <li key={lesson.id}><Link href={`/poligon/b/learn/${lesson.id}`} className="inline-block py-2 text-[var(--text-2)] hover:underline">{done.has(lesson.id) ? "✓ " : ""}{lesson.title}</Link></li>
          ))}
        </ul>
        <h3 className="mb-2 mt-4 text-[15px]">Прежние упражнения</h3>
        <ul className="flex flex-col gap-2 text-[14px]">
          {legacyVariants.map((variant) => (
            <li key={variant.id}>
              <Link href={`/poligon/b/test/${variant.id}`} className="inline-block py-2 text-[var(--text-2)] hover:underline">{variant.title}</Link>
              <span className="block text-[13px] text-[var(--text-3)]">{variant.kind === "championship" ? "Прежний прогон · Приложение 9 · 6 часов" : "«Осенний кубок» · прежнее упражнение"}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function PracticeLink({ variant }: { variant: Variant }) {
  return (
    <Link href={`/poligon/b/test/${variant.id}`} className="block rounded-[var(--radius-control)] bg-[var(--points-bg)] px-4 py-3 text-[var(--points-ink)] hover:underline">
      <span className="block text-[15px] font-semibold">{variant.title} →</span>
      <span className="mt-1 block text-[13px]">{fmtMinutes(variant.minutes)} · учебная практика · XLSX после начала попытки</span>
    </Link>
  );
}
