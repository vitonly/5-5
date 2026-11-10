/*
 * Тренер: результат входной диагностики ученика.
 * Автопроверка тестов по разделам, все ответы, кнопка «Выгрузка для Claude» и сброс попытки.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { fullName } from "@/lib/poligon/server";
import { cleanDiagAnswers, DIAG_SECTIONS } from "@/content/poligon/diag";
import { diagExportText, scoreDiag } from "@/lib/poligon/diag-keys";
import { PageHeader, StatTile } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { DiagAdminActions } from "@/components/poligon/admin/DiagAdminActions";

export const metadata = { title: "Диагностика — тренер" };
export const dynamic = "force-dynamic";

export default async function AdminDiagPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const student = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, firstName: true, lastName: true, poligonDiag: true },
  });
  if (!student) notFound();
  const diag = student.poligonDiag;
  const name = fullName(student);

  let answers = {};
  try {
    answers = cleanDiagAnswers(JSON.parse(diag?.answers ?? "{}"));
  } catch {
    answers = {};
  }
  const { marks, sections } = scoreDiag(answers);
  const text = diagExportText(name, answers, diag?.minutes ?? null);
  const answersMap = answers as Record<string, unknown>;

  return (
    <div className="mx-auto max-w-[860px]">
      <PageHeader
        eyebrow={
          <Link href="/admin/poligon" className="hover:underline">
            ← Профессионалы — тренер
          </Link>
        }
        title={`Диагностика: ${name}`}
        description={
          !diag
            ? "Ученик ещё не начинал тест."
            : diag.status === "SUBMITTED"
              ? `Отправлено ${diag.submittedAt?.toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })}${diag.minutes ? `, ${diag.minutes} мин` : ""}.`
              : "Черновик: ученик ещё отвечает. Ниже — то, что уже сохранено."
        }
      />

      {diag && <DiagAdminActions userId={student.id} text={text} />}

      {/* Автопроверка: только тесты и короткие ответы. Развёрнутые — через выгрузку для Claude */}
      <div className="mb-6 grid grid-cols-2 gap-3 min-[720px]:grid-cols-4">
        {sections.filter((s) => s.max).map((s) => (
          <StatTile
            key={s.code}
            label={`${s.code} · ${s.title}`}
            value={s.max ? `${s.got}/${s.max}` : "—"}
            hint={s.manual ? `+ ${s.manual} развёрнутых` : undefined}
            tone={!s.max ? "default" : s.got / s.max >= 0.8 ? "success" : s.got / s.max < 0.5 ? "warning" : "default"}
          />
        ))}
      </div>

      {DIAG_SECTIONS.map((s) => (
        <section key={s.code} className="mb-6">
          <h2 className="mb-2 text-[18px]">
            {s.code} · {s.title}
          </h2>
          <ul className="flex flex-col gap-2">
            {s.items
              .filter((it) => it.t !== "table")
              .map((it) => {
                const v = answersMap[it.id];
                const m = marks[it.id];
                let shown = "—";
                if (it.t === "single" && typeof v === "number") shown = it.opts[v];
                else if (it.t === "multi" && Array.isArray(v) && v.length) shown = v.map((i: number) => it.opts[i]).join("; ");
                else if (it.t === "scale" && v && typeof v === "object")
                  shown = it.rows.map(([k, label]) => `${label}: ${(v as Record<string, number>)[k] ?? "—"}`).join("\n");
                else if (typeof v === "string" && v.trim()) shown = v.trim();
                return (
                  <li key={it.id} className="surface-card flex flex-col gap-1 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[14px] font-medium text-[var(--text)]">{it.q}</p>
                      {m == null ? (
                        it.t !== "scale" && <Badge variant="warning">проверить</Badge>
                      ) : m === 1 ? (
                        <Badge variant="success">верно</Badge>
                      ) : m === 0 ? (
                        <Badge variant="danger">неверно</Badge>
                      ) : (
                        <Badge variant="warning">{Math.round(m * 100)}%</Badge>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap text-[14px] text-[var(--text-2)]">{shown}</p>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}
