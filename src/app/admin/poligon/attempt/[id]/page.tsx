/*
 * Тренер: проверка попытки — файлы ученика, оценки по аспектам, итог.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { fullName, overtimeMinutes } from "@/lib/poligon/server";
import {
  MODE_LABEL,
  STATUS_LABEL,
  getModule,
  getVariant,
  isModuleCode,
  parseFiles,
  parseScores,
  variantTasks,
} from "@/lib/poligon/core";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GradeForm } from "@/components/poligon/admin/GradeForm";
import { CopyForReview } from "@/components/poligon/admin/CopyForReview";
import { WorkbookView } from "@/components/poligon/workbooks/WorkbookView";
import { parseWorkbook, workbookText } from "@/lib/poligon/a-practicum";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Moscow",
});

export default async function AdminAttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const attempt = await prisma.poligonAttempt.findUnique({
    where: { id },
    include: { user: { select: { firstName: true, lastName: true } } },
  });
  if (!attempt || !isModuleCode(attempt.moduleCode)) notFound();
  const mod = getModule(attempt.moduleCode);
  const variant = mod ? getVariant(mod, attempt.variantId) : null;
  if (!mod || !variant) notFound();

  const tasks = variantTasks(attempt.moduleCode, variant);
  const files = parseFiles(attempt.fileUrls);
  const overtime = overtimeMinutes(attempt.deadlineAt, attempt.submittedAt);
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const reviewText = [
    `Профессионалы — проверка попытки ${attempt.id}`,
    `Ученик: ${fullName(attempt.user)}`,
    `Модуль ${mod.letter} — ${variant.title} (${MODE_LABEL[attempt.mode] ?? attempt.mode}, вариант ${variant.id})`,
    `Задания критериев: ${variant.taskIds.join(", ")}`,
    `Время: ${overtime ? `вышел за время на ${overtime} мин` : "уложился"}`,
    attempt.textAnswer ? `Комментарий ученика: ${attempt.textAnswer}` : "",
    "Файлы:",
    ...files.map((f) => `- ${f.name}: ${base}${f.url}`),
    ...(variant.workbook
      ? [
          "",
          `Тетрадь (${variant.workbook}):`,
          variant.workbook.startsWith("a-")
            ? workbookText(parseWorkbook(attempt.workbook))
            : Object.entries(parseWorkbook(attempt.workbook)).map(([k, v]) => `${k}: ${v}`).join("\n"),
        ]
      : []),
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="mx-auto max-w-[900px]">
      <PageHeader
        eyebrow={
          <Link href="/admin/poligon" className="hover:underline">
            ← Профессионалы
          </Link>
        }
        title={`${fullName(attempt.user)} · Модуль ${mod.letter}`}
        description={variant.title}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href={`/poligon/attempt/${attempt.id}`}>Как видит ученик</Link>
          </Button>
        }
      />

      <section className="surface-card mb-4 p-4">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <Badge>{MODE_LABEL[attempt.mode] ?? attempt.mode}</Badge>
          <Badge variant={attempt.status === "GRADED" ? "success" : attempt.status === "SUBMITTED" ? "warning" : "default"}>
            {STATUS_LABEL[attempt.status] ?? attempt.status}
          </Badge>
          {attempt.publishedAt && <Badge variant="success">отчёт открыт ученику</Badge>}
          <Badge variant={overtime ? "warning" : "default"}>{overtime ? `опоздание ${overtime} мин` : "в срок"}</Badge>
        </div>
        <p className="text-[14px] text-[var(--text-2)]">
          Начато: {dateFmt.format(attempt.startedAt)}
          {attempt.submittedAt && ` · сдано: ${dateFmt.format(attempt.submittedAt)}`}
        </p>
        {attempt.textAnswer && (
          <p className="mt-2 whitespace-pre-line rounded-[var(--radius-control)] bg-[var(--surface-muted)] px-3 py-2 text-[14px] text-[var(--text)]">
            {attempt.textAnswer}
          </p>
        )}
        <h3 className="mt-3 text-[15px]">Файлы ученика</h3>
        {files.length ? (
          <ul className="mt-1 flex flex-col gap-1 text-[14px]">
            {files.map((f) => (
              <li key={f.url}>
                <a href={f.url} className="text-[var(--points-ink)] underline" download>
                  {f.name}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-[var(--text-3)]">Файлов нет.</p>
        )}
        <div className="mt-3">
          <CopyForReview text={reviewText} />
        </div>
      </section>

      {variant.workbook && (
        <details className="mb-4">
          <summary className="mb-3 cursor-pointer text-[16px] font-semibold text-[var(--text)]">Тетрадь ученика и автоматический разбор</summary>
          <WorkbookView id={variant.workbook} initial={parseWorkbook(attempt.workbook)} readOnly />
        </details>
      )}

      <GradeForm
        attemptId={attempt.id}
        tasks={tasks}
        initialScores={parseScores(attempt.scores)}
        initialSummary={{ good: attempt.good, improve: attempt.improve, nextSteps: attempt.nextSteps }}
        published={!!attempt.publishedAt}
      />
    </div>
  );
}
