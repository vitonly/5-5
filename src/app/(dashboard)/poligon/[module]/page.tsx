/*
 * Модуль полигона: вкладки «Подготовка» (уроки), «Тестирование» (задания), «Мои попытки».
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getPoligonUser } from "@/lib/poligon/server";
import { CRITERIA } from "@/content/poligon/criteria";
import { QUIZ } from "@/content/poligon/quiz";
import { fmtMinutes, fmtPoints, getModule } from "@/lib/poligon/core";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { NoAccess } from "@/components/poligon/NoAccess";
import { AttemptList } from "@/components/poligon/AttemptList";
import { PcRunList } from "@/components/poligon/PcRunList";
import { BTaskMenu } from "@/components/poligon/BTaskMenu";
import { cn } from "@/lib/utils";
import { LessonList, VariantGrid } from "@/components/poligon/LearningCards";

export const dynamic = "force-dynamic";

const TABS = [
  { value: "learn", label: "Подготовка" },
  { value: "test", label: "Тестирование" },
  { value: "attempts", label: "Мои попытки" },
] as const;

export default async function ModulePage({
  params,
  searchParams,
}: {
  params: Promise<{ module: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getPoligonUser();
  if (!user) return <NoAccess />;
  const { module: code } = await params;
  const { tab: rawTab } = await searchParams;
  const mod = getModule(code);
  if (!mod || !mod.ready) notFound();
  const tab = TABS.some((t) => t.value === rawTab) ? rawTab : "learn";

  const [done, attempts, pcRuns, quizBest] = await Promise.all([
    prisma.poligonLessonDone.findMany({ where: { userId: user.id }, select: { lessonId: true } }),
    prisma.poligonAttempt.findMany({ where: { userId: user.id, moduleCode: mod.code }, orderBy: { createdAt: "desc" } }),
    mod.code === "v" ? prisma.poligonPcRun.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 30 }) : Promise.resolve([]),
    prisma.poligonQuizResult.findFirst({
      where: { userId: user.id, moduleCode: mod.code },
      orderBy: [{ correct: "desc" }, { createdAt: "desc" }],
    }),
  ]);
  const quiz = QUIZ[mod.code];
  const trainers = mod.variants.filter((v) => v.kind === "trainer");
  const runs = mod.variants.filter((v) => v.kind !== "trainer");
  const criteria = CRITERIA[mod.code];

  return (
    <div>
      <PageHeader
        eyebrow={
          <Link href="/poligon" className="hover:underline">
            ← Профессионалы
          </Link>
        }
        title={`Модуль ${mod.letter}. ${mod.title}`}
        description={mod.about}
      />

      <div className="surface-card mb-6 p-4">
        <p className="mb-2 text-[13px] font-semibold text-[var(--text)]">
          На чемпионате: {fmtMinutes(mod.hours * 60)} · {mod.maxPoints} баллов
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-[14px] text-[var(--text-2)]">
          {mod.rules.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {criteria.tasks.map((t) => (
            <Badge key={t.id} variant="points">
              {t.title}: {fmtPoints(t.aspects.reduce((s, a) => s + a.weight, 0))}
            </Badge>
          ))}
        </div>
      </div>

      <nav className="no-scrollbar mb-5 inline-flex gap-1 overflow-x-auto rounded-[var(--radius-control)] bg-[var(--control)] p-1">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={`/poligon/${mod.code}?tab=${t.value}`}
            className={cn(
              "whitespace-nowrap rounded-[calc(var(--radius-control)-4px)] px-3 py-1.5 text-[14px] font-medium",
              t.value === tab ? "bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-xs)]" : "text-[var(--text-2)]"
            )}
          >
            {t.label}
            {t.value === "attempts" && attempts.length ? ` · ${attempts.length}` : ""}
          </Link>
        ))}
      </nav>

      {tab === "learn" && quiz && (
        <Link
          href={`/poligon/${mod.code}/quiz`}
          className="surface-card mb-5 flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:border-[var(--border-field)]"
        >
          <span>
            <span className="block text-[15px] font-semibold text-[var(--text)]">Блиц по модулю {mod.letter} · обязательно</span>
            <span className="block text-[13px] text-[var(--text-3)]">{quiz.length} вопросов по урокам — как устный блиц на площадке</span>
          </span>
          <Badge variant={!quizBest ? "danger" : quizBest.correct === quizBest.total ? "success" : "warning"}>
            {quizBest ? `лучший: ${quizBest.correct} из ${quizBest.total}` : "не пройден"}
          </Badge>
        </Link>
      )}

      {mod.code === "b" && (tab === "learn" || tab === "test") && (
        <BTaskMenu module={mod} doneIds={done.map((item) => item.lessonId)} tab={tab} />
      )}

      {mod.code !== "b" && tab === "learn" && trainers.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-[17px]">Тренажёры — по каждому заданию</h2>
          <VariantGrid variants={trainers} code={mod.code} />
        </section>
      )}

      {mod.code !== "b" && tab === "learn" && <h2 className="mb-2 text-[17px]">Уроки</h2>}
      {mod.code !== "b" && tab === "learn" && (
        <LessonList lessons={mod.lessons} code={mod.code} doneIds={done.map(d => d.lessonId)} />
      )}

      {mod.code !== "b" && tab === "test" && <VariantGrid variants={runs} code={mod.code} />}

      {tab === "attempts" && <AttemptList attempts={attempts} hrefBase="/poligon/attempt" />}
      {tab === "attempts" && mod.code === "v" && (
        <section className="mt-6">
          <h2 className="mb-2 text-[17px]">Практика на ПК с тренером</h2>
          <PcRunList runs={pcRuns} />
        </section>
      )}
    </div>
  );
}
