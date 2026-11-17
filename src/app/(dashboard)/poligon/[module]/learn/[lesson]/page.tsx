/*
 * Урок полигона: теория с нуля, формулы, ловушки и упражнения со скрытыми ответами.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getPoligonUser } from "@/lib/poligon/server";
import { CRITERIA } from "@/content/poligon/criteria";
import { fmtPoints, getLesson, getModule } from "@/lib/poligon/core";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Blocks } from "@/components/poligon/Blocks";
import { LessonDoneButton } from "@/components/poligon/LessonDoneButton";
import { NoAccess } from "@/components/poligon/NoAccess";
import { B_SKILL_MAPPING } from "@/content/poligon/b-lessons";

export const dynamic = "force-dynamic";

export default async function LessonPage({ params }: { params: Promise<{ module: string; lesson: string }> }) {
  const user = await getPoligonUser();
  if (!user) return <NoAccess />;
  const { module: code, lesson: lessonId } = await params;
  const mod = getModule(code);
  const lesson = mod ? getLesson(mod, lessonId) : null;
  if (!mod || !lesson) notFound();

  const primaryB = mod.code === "b" && lesson.id.startsWith("b-step-");
  // Основной курс Б — 19 уроков. Старые уроки остаются отдельным архивом.
  const course = mod.code === "b" ? mod.lessons.filter(l => l.id.startsWith("b-step-") === primaryB) : mod.lessons;
  const index = course.indexOf(lesson);
  const prev = course[index - 1];
  const next = course[index + 1];
  const related = primaryB ? B_SKILL_MAPPING.find(m => m.lessonId === lesson.id)?.sourceLessonIds ?? [] : [];
  const done = await prisma.poligonLessonDone.findUnique({
    where: { userId_lessonId: { userId: user.id, lessonId: lesson.id } },
  });
  // Аспекты критериев, к которым относится урок, — с баллами
  const aspects = CRITERIA[mod.code].tasks.flatMap((t) => t.aspects).filter((a) => lesson.aspectIds.includes(a.id));

  return (
    <div className="mx-auto max-w-[760px]">
      <PageHeader
        eyebrow={
          <Link href={`/poligon/${mod.code}?tab=learn`} className="hover:underline">
            ← Модуль {mod.letter} · урок {index + 1} из {course.length}
          </Link>
        }
        title={primaryB ? `${index + 1}. ${lesson.title}` : lesson.title}
        description={`${lesson.summary} · ${lesson.minutes} мин`}
      />
      {aspects.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-1.5">
          {aspects.map((a) => (
            <Badge key={a.id} variant={a.type === "I" ? "points" : "admin"}>
              {a.title.length > 48 ? `${a.title.slice(0, 46)}…` : a.title} · {fmtPoints(a.weight)}
            </Badge>
          ))}
        </div>
      )}

      <article className="surface-card p-4 min-[720px]:p-6">
        <Blocks blocks={lesson.blocks} />
      </article>
      {related.length > 0 && <details className="mt-4 rounded-[var(--radius-control)] border border-[var(--border)] px-4 py-2">
        <summary className="min-h-11 cursor-pointer py-2 text-[14px] font-medium text-[var(--text)]">Нужна помощь с кнопками и формулами Excel?</summary>
        <ul className="flex flex-col gap-1 pb-2 text-[14px]">
          {related.map(id => {
            const source = mod.lessons.find(l => l.id === id);
            return source ? <li key={id}><Link className="inline-flex min-h-11 items-center py-2 text-[var(--points-ink)] hover:underline" href={`/poligon/b/learn/${id}`}>{source.title} →</Link></li> : null;
          })}
        </ul>
      </details>}
      {lesson.practiceVariantId && (
        <Button asChild className="mt-4">
          <Link href={`/poligon/${mod.code}/test/${lesson.practiceVariantId}`}>Отработать навык в Excel →</Link>
        </Button>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <LessonDoneButton lessonId={lesson.id} initialDone={!!done} />
        <div className="flex gap-2">
          {prev && (
            <Button asChild variant="ghost">
              <Link href={`/poligon/${mod.code}/learn/${prev.id}`}>← Назад</Link>
            </Button>
          )}
          {next ? (
            <Button asChild variant="outline">
              <Link href={`/poligon/${mod.code}/learn/${next.id}`}>Следующий урок →</Link>
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link href={`/poligon/${mod.code}?tab=test`}>К заданиям →</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
