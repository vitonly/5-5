/*
 * Модуль полигона: вкладки «Подготовка» (уроки), «Тестирование» (задания), «Мои попытки».
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getPoligonUser } from "@/lib/poligon/server";
import { CRITERIA } from "@/content/poligon/criteria";
import { QUIZ } from "@/content/poligon/quiz";
import type { ModuleCode, Variant } from "@/lib/poligon/types";
import { fmtMinutes, fmtPoints, getModule, maxPoints, variantTasks } from "@/lib/poligon/core";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { NoAccess } from "@/components/poligon/NoAccess";
import { AttemptList } from "@/components/poligon/AttemptList";
import { PcRunList } from "@/components/poligon/PcRunList";
import { cn } from "@/lib/utils";

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
  const doneSet = new Set(done.map((d) => d.lessonId));
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

      {tab === "learn" && trainers.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-[17px]">Тренажёры — по каждому заданию</h2>
          <VariantGrid variants={trainers} code={mod.code} />
        </section>
      )}

      {tab === "learn" && <h2 className="mb-2 text-[17px]">Уроки</h2>}
      {tab === "learn" && (
        <ol className="flex flex-col gap-2">
          {mod.lessons.map((l, i) => (
            <li key={l.id}>
              <Link
                href={`/poligon/${mod.code}/learn/${l.id}`}
                className="surface-card flex items-center gap-3 px-4 py-3 hover:border-[var(--border-field)]"
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full font-mono-num text-[14px] font-semibold",
                    doneSet.has(l.id) ? "bg-[var(--success-bg)] text-[var(--success-ink)]" : "bg-[var(--control)] text-[var(--text-2)]"
                  )}
                >
                  {doneSet.has(l.id) ? "✓" : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-[var(--text)]">{l.title}</span>
                  <span className="block text-[13px] text-[var(--text-3)]">{l.summary}</span>
                </span>
                <span className="shrink-0 text-[13px] text-[var(--text-3)]">{l.minutes} мин</span>
              </Link>
            </li>
          ))}
        </ol>
      )}

      {tab === "test" && <VariantGrid variants={runs} code={mod.code} />}

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

/** Карточки заданий: тренажёры, тренировки с файлами, прогон как на чемпионате */
function VariantGrid({ variants, code }: { variants: Variant[]; code: ModuleCode }) {
  return (
    <div className="grid gap-3 min-[720px]:grid-cols-2">
      {variants.map((v) => (
        <Link
          key={v.id}
          href={`/poligon/${code}/test/${v.id}`}
          className="surface-card flex flex-col gap-2 p-4 hover:border-[var(--border-field)]"
        >
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
