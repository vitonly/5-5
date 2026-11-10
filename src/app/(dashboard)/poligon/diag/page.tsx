/*
 * Входная диагностика: один раз в начале подготовки, чтобы понять, с какого уровня начинать каждый модуль.
 */
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getPoligonUser } from "@/lib/poligon/server";
import { cleanDiagAnswers } from "@/content/poligon/diag";
import { PageHeader } from "@/components/ui/page-header";
import { NoAccess } from "@/components/poligon/NoAccess";
import { DiagRunner } from "@/components/poligon/DiagRunner";

export const metadata = { title: "Входная диагностика" };
export const dynamic = "force-dynamic";

export default async function DiagPage() {
  const user = await getPoligonUser();
  if (!user) return <NoAccess />;
  const diag = await prisma.poligonDiag.findUnique({ where: { userId: user.id } });
  const submitted = diag?.status === "SUBMITTED";
  // Ответы читаем через «чистку» — если в базе что-то сломано, страница всё равно откроется
  let saved = {};
  try {
    saved = cleanDiagAnswers(JSON.parse(diag?.answers ?? "{}"));
  } catch {
    saved = {};
  }

  return (
    <div className="mx-auto max-w-[760px]">
      <PageHeader
        eyebrow={
          <Link href="/poligon" className="hover:underline">
            ← Профессионалы
          </Link>
        }
        title="Входная диагностика"
        description="Тест показывает, с какого уровня начинаем подготовку по каждому модулю. Честное «не знаю» полезнее угаданного ответа. Около 60–75 минут."
      />

      {submitted ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--success-border)] bg-[var(--success-bg)] p-4">
          <p className="font-display text-[20px] font-bold text-[var(--text)]">Тест отправлен</p>
          <p className="mt-1 text-[14px] text-[var(--text-2)]">
            Тренер разберёт ответы и соберёт план подготовки под тебя. Пройти ещё раз можно, только если тренер сбросит попытку.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-6 rounded-[var(--radius-card)] border border-[var(--warning-border)] bg-[var(--warning-bg)] p-4 text-[14px] text-[var(--text)]">
            <p className="font-semibold">Правила</p>
            <ul className="mt-1 list-disc pl-5 text-[var(--text-2)]">
              <li>Без интернета, нейросетей и подсказок — как на чемпионате (в модулях А, Б и В ИИ запрещён).</li>
              <li>Не знаешь — пиши «не знаю» или пропускай. Так план получится точнее.</li>
              <li>Можно прерваться и вернуться: ответы сохраняются сами.</li>
              <li>Попытка одна: после «Завершить тест» ответы уже не изменить.</li>
            </ul>
          </div>
          <DiagRunner initial={saved} />
        </>
      )}
    </div>
  );
}
