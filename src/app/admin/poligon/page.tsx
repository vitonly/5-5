/*
 * Тренер: полигон — работы на проверку, доступ учеников, файлы заданий.
 */
import Link from "next/link";
import { prisma } from "@/lib/db";
import { POLIGON_MODULES } from "@/content/poligon";
import { fullName } from "@/lib/poligon/server";
import { PageHeader, StatTile } from "@/components/ui/page-header";
import { AttemptList } from "@/components/poligon/AttemptList";
import { AccessManager } from "@/components/poligon/admin/AccessManager";
import { VariantFiles } from "@/components/poligon/admin/VariantFiles";

export const metadata = { title: "Профессионалы — тренер" };
export const dynamic = "force-dynamic";

export default async function AdminPoligonPage() {
  const [attempts, students, doneCounts, files, quizzes, diags] = await Promise.all([
    prisma.poligonAttempt.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.user.findMany({
      where: { role: "STUDENT" },
      select: { id: true, firstName: true, lastName: true, poligonAccess: true },
      orderBy: { firstName: "asc" },
    }),
    prisma.poligonLessonDone.groupBy({ by: ["userId"], _count: { _all: true } }),
    prisma.poligonVariantFile.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.poligonQuizResult.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.poligonDiag.findMany({ select: { userId: true, status: true } }),
  ]);
  // Статус входной диагностики по ученикам
  const diagStatus = new Map(diags.map((d) => [d.userId, d.status]));
  // Лучший результат блица: ученик → модуль → «верно из всего»
  const bestQuiz = new Map<string, { correct: number; total: number }>();
  for (const q of quizzes) {
    const k = `${q.userId}:${q.moduleCode}`;
    const cur = bestQuiz.get(k);
    if (!cur || q.correct > cur.correct) bestQuiz.set(k, { correct: q.correct, total: q.total });
  }
  const withAccess = students.filter((s) => s.poligonAccess);
  const quizModules = POLIGON_MODULES.filter((m) => m.ready);
  const names = Object.fromEntries(students.map((s) => [s.id, fullName(s)]));
  const done = Object.fromEntries(doneCounts.map((d) => [d.userId, d._count._all]));
  const toCheck = attempts.filter((a) => a.status === "SUBMITTED");
  const other = attempts.filter((a) => a.status !== "SUBMITTED");
  // Варианты, к которым тренер должен приложить файлы сам
  const needFiles = POLIGON_MODULES.flatMap((m) =>
    m.variants
      .filter((v) => v.sourceFiles.some((f) => !f.builtinUrl))
      .map((v) => ({ module: m, variant: v }))
  );

  return (
    <div>
      <PageHeader
        eyebrow="Подготовка к чемпионату"
        title="Профессионалы"
        description="Ученик сдаёт файлы → ты скачиваешь и отправляешь на проверку → ставишь оценки по аспектам и пишешь итог → «Открыть ученику»."
      />
      <div className="mb-6 grid grid-cols-2 gap-3 min-[720px]:grid-cols-4">
        <StatTile label="На проверку" value={toCheck.length} tone={toCheck.length ? "warning" : "default"} />
        <StatTile label="Всего попыток" value={attempts.length} />
        <StatTile label="С доступом" value={students.filter((s) => s.poligonAccess).length} />
        <StatTile label="Модулей готово" value={POLIGON_MODULES.filter((m) => m.ready).length} hint={`из ${POLIGON_MODULES.length}`} />
      </div>

      <div className="mb-6">
        <Link href="/admin/poligon/pc" className="surface-card inline-flex items-center gap-2 px-4 py-3 text-[15px] font-medium text-[var(--text)] hover:border-[var(--border-field)]">
          Практика на ПК (модуль В) — пульт тренера →
        </Link>
      </div>

      {withAccess.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-[18px]">Ученики: блиц, карта ошибок, диагностика</h2>
          <ul className="flex flex-col gap-2">
            {withAccess.map((st) => (
              <li key={st.id} className="surface-card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="text-[15px] font-medium text-[var(--text)]">{fullName(st)}</span>
                <span className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--text-2)]">
                  {quizModules.map((m) => {
                    const b = bestQuiz.get(`${st.id}:${m.code}`);
                    return (
                      <span key={m.code}>
                        Блиц {m.letter}: {b ? `${b.correct}/${b.total}` : "—"}
                      </span>
                    );
                  })}
                  <Link className="font-medium text-[var(--points-ink)] underline" href={`/poligon/map?user=${st.id}`}>
                    Карта ошибок
                  </Link>
                  <Link className="font-medium text-[var(--points-ink)] underline" href={`/admin/poligon/diag/${st.id}`}>
                    Диагностика:{" "}
                    {diagStatus.get(st.id) === "SUBMITTED" ? "отправлена" : diagStatus.has(st.id) ? "черновик" : "нет"}
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-[18px]">Работы на проверку</h2>
        <AttemptList attempts={toCheck} hrefBase="/admin/poligon/attempt" names={names} />
      </section>

      <div className="mb-8 grid gap-6 min-[960px]:grid-cols-2">
        <section className="surface-card p-4">
          <h2 className="mb-3 text-[18px]">Доступ учеников</h2>
          <AccessManager
            students={students.map((s) => ({ id: s.id, name: fullName(s), access: s.poligonAccess, lessonsDone: done[s.id] ?? 0 }))}
          />
        </section>
        <section className="surface-card p-4">
          <h2 className="mb-3 text-[18px]">Файлы заданий</h2>
          <div className="flex flex-col gap-4">
            {needFiles.map(({ module, variant }) => (
              <div key={variant.id}>
                <p className="text-[15px] font-medium text-[var(--text)]">
                  Модуль {module.letter} — {variant.title}
                </p>
                <VariantFiles
                  variantId={variant.id}
                  hint={variant.sourceFiles.filter((f) => !f.builtinUrl).map((f) => f.label).join(", ")}
                  files={files.filter((f) => f.variantId === variant.id).map((f) => ({ id: f.id, label: f.label, url: f.url }))}
                />
              </div>
            ))}
          </div>
        </section>
      </div>

      <section>
        <h2 className="mb-3 text-[18px]">Остальные попытки</h2>
        <AttemptList attempts={other} hrefBase="/admin/poligon/attempt" names={names} />
      </section>
    </div>
  );
}
