/*
 * Задание полигона перед стартом: текст задания, исходные файлы, что сдать и за что баллы.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getPoligonUser } from "@/lib/poligon/server";
import { fmtMinutes, fmtPoints, getModule, getVariant, maxPoints, variantTasks } from "@/lib/poligon/core";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Blocks } from "@/components/poligon/Blocks";
import { CriteriaPreview } from "@/components/poligon/CriteriaPreview";
import { StartAttemptButton } from "@/components/poligon/StartAttemptButton";
import { NoAccess } from "@/components/poligon/NoAccess";

export const dynamic = "force-dynamic";

export default async function VariantPage({ params }: { params: Promise<{ module: string; variant: string }> }) {
  const user = await getPoligonUser();
  if (!user) return <NoAccess />;
  const { module: code, variant: variantId } = await params;
  const mod = getModule(code);
  const variant = mod ? getVariant(mod, variantId) : null;
  if (!mod || !variant) notFound();

  const tasks = variantTasks(mod.code, variant);
  const [running, uploaded] = await Promise.all([
    prisma.poligonAttempt.findFirst({
      where: { userId: user.id, variantId: variant.id, status: "IN_PROGRESS" },
      select: { id: true },
    }),
    prisma.poligonVariantFile.findMany({ where: { variantId: variant.id }, orderBy: { createdAt: "asc" } }),
  ]);
  const championship = variant.kind === "championship";
  // Файлы, которые тренер должен приложить сам, а ещё не приложил
  const missing = variant.sourceFiles.filter((f) => !f.builtinUrl).length > 0 && uploaded.length === 0;

  return (
    <div className="mx-auto max-w-[860px]">
      <PageHeader
        eyebrow={
          <Link href={`/poligon/${mod.code}?tab=test`} className="hover:underline">
            ← Модуль {mod.letter} · Тестирование
          </Link>
        }
        title={variant.title}
        description={variant.summary}
      />
      <div className="mb-5 flex flex-wrap gap-1.5">
        <Badge variant={championship ? "danger" : "default"}>
          {championship ? "Жёсткий таймер" : "Мягкий таймер"}
        </Badge>
        <Badge>{fmtMinutes(variant.minutes)}</Badge>
        <Badge variant="points">до {fmtPoints(maxPoints(tasks))} баллов</Badge>
      </div>

      <section className="surface-card mb-4 p-4 min-[720px]:p-6">
        <h2 className="mb-3 text-[18px]">Задание</h2>
        <Blocks blocks={variant.brief} />
      </section>

      <section className="surface-card mb-4 p-4 min-[720px]:p-6">
        <h2 className="mb-3 text-[18px]">Исходные файлы</h2>
        <ul className="flex flex-col gap-2 text-[15px]">
          {variant.sourceFiles
            .filter((f) => f.builtinUrl)
            .map((f) => (
              <li key={f.label}>
                <a className="font-medium text-[var(--points-ink)] underline" href={f.builtinUrl} download>
                  {f.label}
                </a>
              </li>
            ))}
          {uploaded.map((f) => (
            <li key={f.id}>
              <a className="font-medium text-[var(--points-ink)] underline" href={f.url} download>
                {f.label}
              </a>
            </li>
          ))}
        </ul>
        {missing && (
          <p className="mt-2 text-[14px] text-[var(--warning-ink)]">
            Тренер ещё не приложил файлы к этому заданию — напиши ему перед стартом.
          </p>
        )}
      </section>

      <section className="surface-card mb-4 p-4 min-[720px]:p-6">
        <h2 className="mb-3 text-[18px]">Что сдать</h2>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-[15px] text-[var(--text-2)]">
          {variant.deliverables.map((d) => (
            <li key={d.name}>
              <b className="text-[var(--text)]">{d.name}</b> ({d.formats})
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[13px] text-[var(--text-3)]">«Уч№» — замени на свой номер участника (на тренировке — любой, например 01).</p>
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-[18px]">За что дают баллы</h2>
        <CriteriaPreview tasks={tasks} />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        {running ? (
          <Button asChild size="lg">
            <Link href={`/poligon/attempt/${running.id}`}>Продолжить попытку →</Link>
          </Button>
        ) : (
          <StartAttemptButton
            moduleCode={mod.code}
            variantId={variant.id}
            championship={championship}
            minutesLabel={fmtMinutes(variant.minutes)}
          />
        )}
      </div>
    </div>
  );
}
