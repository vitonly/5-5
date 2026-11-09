/*
 * Попытка ученика: идёт — рабочее место с таймером; сдана — «ждёт проверки»; проверена — отчёт.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPoligonUser, findAttemptFor, isHardClosed, overtimeMinutes } from "@/lib/poligon/server";
import {
  CHAMPIONSHIP_GRACE_MIN,
  MODE_LABEL,
  getModule,
  getVariant,
  isModuleCode,
  parseFiles,
  parseScores,
  variantTasks,
} from "@/lib/poligon/core";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NoAccess } from "@/components/poligon/NoAccess";
import { AttemptWorkspace } from "@/components/poligon/AttemptWorkspace";
import { AttemptReport } from "@/components/poligon/AttemptReport";
import { WorkbookView } from "@/components/poligon/workbooks/WorkbookView";
import { parseWorkbook } from "@/lib/poligon/a-practicum";

export const dynamic = "force-dynamic";

export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getPoligonUser();
  if (!user) return <NoAccess />;
  const { id } = await params;
  const attempt = await findAttemptFor(user, id);
  if (!attempt || !isModuleCode(attempt.moduleCode)) notFound();
  const mod = getModule(attempt.moduleCode);
  const variant = mod ? getVariant(mod, attempt.variantId) : null;
  if (!mod || !variant) notFound();

  const isOwner = attempt.userId === user.id;
  const files = parseFiles(attempt.fileUrls);
  const published = attempt.status === "GRADED" && attempt.publishedAt;
  const closed = attempt.status === "IN_PROGRESS" && isHardClosed(attempt.mode, attempt.deadlineAt);

  return (
    <div className="mx-auto max-w-[860px]">
      <PageHeader
        eyebrow={
          <Link href={`/poligon/${mod.code}?tab=attempts`} className="hover:underline">
            ← Модуль {mod.letter} · {MODE_LABEL[attempt.mode] ?? attempt.mode}
          </Link>
        }
        title={variant.title}
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/poligon/${mod.code}/test/${variant.id}`}>Текст задания</Link>
            </Button>
            {user.role === "ADMIN" && (
              <Button asChild variant="admin" size="sm">
                <Link href={`/admin/poligon/attempt/${attempt.id}`}>Проверить</Link>
              </Button>
            )}
          </>
        }
      />

      {attempt.status === "IN_PROGRESS" && isOwner && !closed && (
        <AttemptWorkspace
          attemptId={attempt.id}
          championship={attempt.mode === "CHAMPIONSHIP"}
          deadlineAt={attempt.deadlineAt.toISOString()}
          graceMin={CHAMPIONSHIP_GRACE_MIN}
          initialFiles={files}
          initialText={attempt.textAnswer}
          deliverables={variant.deliverables}
          workbook={variant.workbook}
          initialWorkbook={parseWorkbook(attempt.workbook)}
        />
      )}

      {closed && (
        <Card className="p-5 text-[15px] text-[var(--text-2)]">
          Время прогона вышло, работа не сдана — как на чемпионате, такую попытку не оценивают.
          {files.length > 0 && " Загруженные файлы тренер всё равно увидит и может разобрать их с тобой."}
        </Card>
      )}

      {(attempt.status === "SUBMITTED" || (attempt.status === "GRADED" && !published)) && (
        <Card className="p-5">
          <p className="text-[16px] font-semibold text-[var(--text)]">Сдано — ждёт проверки тренера</p>
          <p className="mt-1 text-[14px] text-[var(--text-2)]">
            Когда тренер проверит, здесь появится разбор: баллы по каждому заданию, что получилось и что подтянуть. Придёт
            сообщение в Telegram.
          </p>
          <ul className="mt-3 flex flex-col gap-1 text-[14px]">
            {files.map((f) => (
              <li key={f.url}>
                <a href={f.url} className="text-[var(--points-ink)] underline" download>
                  {f.name}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {variant.workbook && attempt.status !== "IN_PROGRESS" && (
        <details className="mb-4" open={!published}>
          <summary className="mb-3 cursor-pointer text-[16px] font-semibold text-[var(--text)]">Моя тетрадь и разбор</summary>
          <WorkbookView id={variant.workbook} initial={parseWorkbook(attempt.workbook)} readOnly />
        </details>
      )}

      {published && (
        <AttemptReport
          module={mod}
          tasks={variantTasks(attempt.moduleCode, variant)}
          scores={parseScores(attempt.scores)}
          good={attempt.good}
          improve={attempt.improve}
          nextSteps={attempt.nextSteps}
          overtime={overtimeMinutes(attempt.deadlineAt, attempt.submittedAt)}
        />
      )}
    </div>
  );
}
