/*
 * Полигон — главная: все модули чемпионата, прогресс по урокам и лучший результат.
 */
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getPoligonUser } from "@/lib/poligon/server";
import { POLIGON_MODULES } from "@/content/poligon";
import { fmtMinutes, fmtPoints, isModuleCode, parseScores, taskResults, totalOf, variantTasks, getVariant } from "@/lib/poligon/core";
import { PageHeader, StatTile } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NoAccess } from "@/components/poligon/NoAccess";
import { cn } from "@/lib/utils";

export const metadata = { title: "Профессионалы" };
export const dynamic = "force-dynamic";

export default async function PoligonPage() {
  const user = await getPoligonUser();
  if (!user) return <NoAccess />;

  const [done, attempts] = await Promise.all([
    prisma.poligonLessonDone.findMany({ where: { userId: user.id }, select: { lessonId: true } }),
    prisma.poligonAttempt.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
  ]);
  const doneSet = new Set(done.map((d) => d.lessonId));
  const totalMax = POLIGON_MODULES.reduce((s, m) => s + m.maxPoints, 0);
  const waiting = attempts.filter((a) => a.status === "SUBMITTED").length;
  const graded = attempts.filter((a) => a.status === "GRADED").length;

  return (
    <div>
      <PageHeader
        eyebrow="Технологии компьютерного спорта"
        title="Профессионалы"
        description="Готовимся к чемпионату по модулям: в «Подготовке» — уроки, блиц и тренажёры, в «Тестировании» — прогоны как на площадке. Тренер проверяет и пишет, что подтянуть."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/poligon/map">Карта ошибок</Link>
          </Button>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 min-[720px]:grid-cols-4">
        <StatTile label="Модулей" value={POLIGON_MODULES.length} hint={`${totalMax} баллов всего`} />
        <StatTile label="Уроков пройдено" value={doneSet.size} />
        <StatTile label="Ждут проверки" value={waiting} tone={waiting ? "warning" : "default"} />
        <StatTile label="Проверено" value={graded} tone={graded ? "success" : "default"} />
      </div>

      <div className="grid gap-3 min-[720px]:grid-cols-2">
        {POLIGON_MODULES.map((m) => {
          const lessonsDone = m.lessons.filter((l) => doneSet.has(l.id)).length;
          // Лучший проверенный результат по модулю — в процентах от максимума варианта
          let best: { points: number; max: number } | null = null;
          for (const a of attempts) {
            if (a.moduleCode !== m.code || a.status !== "GRADED" || !isModuleCode(a.moduleCode)) continue;
            const v = getVariant(m, a.variantId);
            if (!v) continue;
            const t = totalOf(taskResults(variantTasks(a.moduleCode, v), parseScores(a.scores)));
            if (!best || t.points / t.max > best.points / best.max) best = t;
          }
          const body = (
            <div className={cn("surface-card flex h-full flex-col gap-2 p-4", !m.ready && "opacity-60")}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-[22px] font-bold text-[var(--points-ink)]">Модуль {m.letter}</span>
                <span className="flex gap-1.5">
                  <Badge>{fmtMinutes(m.hours * 60)}</Badge>
                  <Badge variant="points">{m.maxPoints} б.</Badge>
                </span>
              </div>
              <h2 className="font-display text-[17px] font-semibold text-[var(--text)]">{m.title}</h2>
              <p className="text-[14px] leading-relaxed text-[var(--text-2)]">{m.about}</p>
              <div className="mt-auto flex flex-wrap gap-2 pt-2 text-[13px] text-[var(--text-3)]">
                {m.ready ? (
                  <>
                    <span>
                      Уроки: {lessonsDone} из {m.lessons.length}
                    </span>
                    <span>· Заданий: {m.variants.length}</span>
                    {best && (
                      <span className="text-[var(--success-ink)]">
                        · Лучший результат: {fmtPoints(best.points)} из {fmtPoints(best.max)}
                      </span>
                    )}
                  </>
                ) : (
                  <span>Скоро</span>
                )}
              </div>
            </div>
          );
          return m.ready ? (
            <Link key={m.code} href={`/poligon/${m.code}`} className="block rounded-[var(--radius-card)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">
              {body}
            </Link>
          ) : (
            <div key={m.code}>{body}</div>
          );
        })}
      </div>
    </div>
  );
}
