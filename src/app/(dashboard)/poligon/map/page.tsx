/*
 * Карта ошибок: где теряются баллы и что повторить на этой неделе.
 * Ученик видит свою карту, тренер — карту любого ученика (?user=id).
 */
import Link from "next/link";
import { prisma } from "@/lib/db";
import { fullName, getPoligonUser } from "@/lib/poligon/server";
import { buildErrorMap } from "@/lib/poligon/error-map";
import { PageHeader, StatTile } from "@/components/ui/page-header";
import { NoAccess } from "@/components/poligon/NoAccess";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Карта ошибок" };

export default async function MapPage({ searchParams }: { searchParams: Promise<{ user?: string }> }) {
  const me = await getPoligonUser();
  if (!me) return <NoAccess />;
  const { user: other } = await searchParams;
  // Чужую карту может открыть только тренер
  const targetId = me.role === "ADMIN" && other ? other : me.id;
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { firstName: true, lastName: true } });
  const map = await buildErrorMap(targetId);

  return (
    <div className="mx-auto max-w-[860px]">
      <PageHeader
        eyebrow={
          <Link href={me.role === "ADMIN" && other ? "/admin/poligon" : "/poligon"} className="hover:underline">
            ← Профессионалы
          </Link>
        }
        title="Карта ошибок"
        description={`${target ? fullName(target) : ""} · где теряются баллы по всем проверенным попыткам и блицам`}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 min-[720px]:grid-cols-4">
        <StatTile label="Проверено попыток" value={map.graded} />
        <StatTile label="Блицев" value={map.quizzes} />
        <StatTile label="Слабых мест" value={map.weak.length} tone={map.weak.length ? "warning" : "success"} />
        <StatTile label="Ошибок в блицах" value={map.weakQ.length} tone={map.weakQ.length ? "warning" : "success"} />
      </div>

      {map.graded === 0 && map.quizzes === 0 && (
        <p className="surface-card mb-6 p-4 text-[15px] text-[var(--text-2)]">
          Карта появится после первой проверенной попытки или блица.
        </p>
      )}

      {map.plan.length > 0 && (
        <section className="surface-card mb-6 p-4">
          <h2 className="mb-2 text-[18px]">План на неделю</h2>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-[15px] text-[var(--text)]">
            {map.plan.map((p, i) => (
              <li key={i}>
                <span>{p.text}.</span>{" "}
                {p.lesson && (
                  <Link className="text-[var(--points-ink)] underline" href={`/poligon/${p.module}/learn/${p.lesson.id}`}>
                    Урок «{p.lesson.title}»
                  </Link>
                )}
                {p.lesson && p.trainer && " → "}
                {p.trainer && (
                  <Link className="text-[var(--points-ink)] underline" href={`/poligon/${p.module}/test/${p.trainer.id}`}>
                    {p.trainer.title}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {map.weak.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-[18px]">Где теряются баллы</h2>
          <ul className="flex flex-col gap-2">
            {map.weak.map((w) => (
              <li key={w.aspectId} className="surface-card flex flex-col gap-1.5 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[15px] text-[var(--text)]">
                    <span className="mr-1 font-mono text-[12px] text-[var(--text-3)]">{w.letter}</span>
                    {w.title}
                  </span>
                  <span className="shrink-0 font-mono-num text-[14px] font-semibold">{Math.round(w.share * 100)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--control)]">
                  <div
                    className={cn("h-full rounded-full", w.share >= 0.4 ? "bg-[var(--warning)]" : "bg-[var(--danger)]")}
                    style={{ width: `${Math.max(3, Math.round(w.share * 100))}%` }}
                  />
                </div>
                <span className="text-[12px] text-[var(--text-3)]">попыток: {w.tries}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {map.weakQ.length > 0 && (
        <section>
          <h2 className="mb-2 text-[18px]">Ошибки в блицах (3 последние попытки)</h2>
          <ul className="flex flex-col gap-1.5 text-[15px]">
            {map.weakQ.map((q, i) => (
              <li key={i} className="surface-card flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span className="text-[var(--text)]">
                  <span className="mr-1 font-mono text-[12px] text-[var(--text-3)]">{q.letter}</span>
                  {q.q}
                </span>
                <span className="text-[13px] text-[var(--danger)]">ошибся {q.times} раз(а)</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
