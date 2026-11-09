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

export const dynamic = "force-dynamic";

export default async function LessonPage({ params }: { params: Promise<{ module: string; lesson: string }> }) {
  const user = await getPoligonUser();
  if (!user) return <NoAccess />;
  const { module: code, lesson: lessonId } = await params;
  const mod = getModule(code);
  const lesson = mod ? getLesson(mod, lessonId) : null;
  if (!mod || !lesson) notFound();

  const index = mod.lessons.indexOf(lesson);
  const prev = mod.lessons[index - 1];
  const next = mod.lessons[index + 1];
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
            ← Модуль {mod.letter} · урок {index + 1} из {mod.lessons.length}
          </Link>
        }
        title={lesson.title}
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
