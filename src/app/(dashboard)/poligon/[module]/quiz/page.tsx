/*
 * Блиц по модулю: вопросы по материалу подготовки, как устный блиц на площадке.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPoligonUser } from "@/lib/poligon/server";
import { getModule, isModuleCode } from "@/lib/poligon/core";
import { QUIZ } from "@/content/poligon/quiz";
import { PageHeader } from "@/components/ui/page-header";
import { NoAccess } from "@/components/poligon/NoAccess";
import { QuizRunner } from "@/components/poligon/QuizRunner";

export const dynamic = "force-dynamic";

export default async function QuizPage({ params }: { params: Promise<{ module: string }> }) {
  const user = await getPoligonUser();
  if (!user) return <NoAccess />;
  const { module: code } = await params;
  const mod = getModule(code);
  const questions = isModuleCode(code) ? QUIZ[code] : undefined;
  if (!mod || !questions) notFound();

  return (
    <div className="mx-auto max-w-[760px]">
      <PageHeader
        eyebrow={
          <Link href={`/poligon/${mod.code}?tab=learn`} className="hover:underline">
            ← Модуль {mod.letter} · Подготовка
          </Link>
        }
        title={`Блиц по модулю ${mod.letter}`}
        description={`${questions.length} вопросов по урокам. Отвечай без подсказок — как на устном блице. Цель — без ошибок.`}
      />
      <QuizRunner
        moduleCode={mod.code}
        questions={questions}
        lessonTitles={Object.fromEntries(mod.lessons.map((l) => [l.id, l.title]))}
      />
    </div>
  );
}
