/*
 * Тренер: практика модуля В на настоящем ПК — пульт и история.
 */
import Link from "next/link";
import { prisma } from "@/lib/db";
import { fullName } from "@/lib/poligon/server";
import { PageHeader } from "@/components/ui/page-header";
import { PcConsole } from "@/components/poligon/admin/PcConsole";
import { PcRunList } from "@/components/poligon/PcRunList";

export const metadata = { title: "Практика на ПК — тренер" };
export const dynamic = "force-dynamic";

export default async function PcPage() {
  const [students, runs] = await Promise.all([
    prisma.user.findMany({ where: { poligonAccess: true }, select: { id: true, firstName: true, lastName: true }, orderBy: { firstName: "asc" } }),
    prisma.poligonPcRun.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const names = Object.fromEntries(students.map((s) => [s.id, fullName(s)]));
  const active = runs.find((r) => !r.done) ?? null;
  let activeUtils: string[] = [];
  try {
    activeUtils = active ? JSON.parse(active.utilities) : [];
  } catch {
    activeUtils = [];
  }

  return (
    <div className="mx-auto max-w-[900px]">
      <PageHeader
        eyebrow={
          <Link href="/admin/poligon" className="hover:underline">
            ← Профессионалы
          </Link>
        }
        title="Практика на ПК · модуль В"
        description="Вноси неисправность по инструкции, говори ученику симптом и жми «старт». Отмечай «нашёл» и «устранил» — баллы за время сайт посчитает сам."
      />
      <section className="mb-8">
        <PcConsole
          key={active?.id ?? "new"}
          students={students.map((s) => ({ id: s.id, name: fullName(s) }))}
          active={
            active
              ? {
                  id: active.id,
                  userName: names[active.userId] ?? "Ученик",
                  faultId: active.faultId,
                  startedAt: active.startedAt.toISOString(),
                  foundAt: active.foundAt?.toISOString() ?? null,
                  fixedAt: active.fixedAt?.toISOString() ?? null,
                  hints: active.hints,
                  utilities: activeUtils,
                  notes: active.notes,
                }
              : null
          }
        />
      </section>
      <h2 className="mb-3 text-[18px]">История</h2>
      <PcRunList runs={runs} names={names} />
    </div>
  );
}
