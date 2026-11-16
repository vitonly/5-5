import Link from "next/link";
import { parseWorkbook } from "@/lib/poligon/a-practicum";
import { B_MODES, isBPractice, type BReview } from "@/lib/poligon/b-practice";

/** Самостоятельность показываем по сохранённым результатам разных вариантов, без выдуманной оценки. */
export function BProgress({ attempts, admin = false }: { attempts: { id: string; variantId: string; workbook: string; status: string; createdAt: Date }[]; admin?: boolean }) {
  const rows = attempts.filter(a => isBPractice(a.variantId)).map(a => {
    const w = parseWorkbook(a.workbook);
    let report: BReview | null = null;
    try { const parsed = JSON.parse(String(w._b_report || "null")); if (Array.isArray(parsed?.checks)) report = parsed; } catch { /* Несданная работа ещё не имеет отчёта. */ }
    return { a, w, report };
  });
  const skills = new Map<string, { label: string; good: Set<string>; bad: number }>();
  for (const { w, report } of rows) {
    for (const c of report?.checks || []) {
      if (c.ok === null) continue;
      const skill = skills.get(c.id) || { label: c.label, good: new Set<string>(), bad: 0 };
      if (w._b_mode === "independent" && !w._b_revealed && c.ok) skill.good.add(String(w._b_seed));
      if (!c.ok) skill.bad++;
      skills.set(c.id, skill);
    }
  }
  return <section className="surface-card my-4 p-4">
    <h2 className="mb-2 text-[18px]">Практика Б на разных данных</h2>
    <p className="mb-3 text-[14px] text-[var(--text-2)]">Здесь подтверждены только проверяемые ответы. Успех без подсказок на нескольких вариантах — свидетельство повторяемости навыка, а не автоматическая конкурсная оценка. Содержание файлов и судейские аспекты оценивает наставник.</p>
    {!rows.length && <p>Новых учебных попыток пока нет. Прежние работы доступны в общем списке.</p>}
    <ul className="flex flex-col gap-2 text-[14px]">{rows.map(({ a, w, report }) => <li key={a.id}><Link className="underline" href={`${admin ? "/admin/poligon/attempt" : "/poligon/attempt"}/${a.id}`}>{a.createdAt.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" })} · {B_MODES[w._b_mode as keyof typeof B_MODES] || "Тренировка"} · вариант {String(w._b_seed).slice(0, 8)}</Link>{w._b_revealed ? " · разбор открыт до сдачи" : ""} · {report ? `${report.checks.filter(c => c.ok === true).length} проверок выполнено, ${report.failedIds.length} ошибок` : "Черновик"}</li>)}</ul>
    {!!skills.size && <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[440px] text-left text-[14px]"><thead><tr><th className="p-2">Навык</th><th className="p-2">Вариантов без подсказок</th><th className="p-2">Попыток с ошибкой</th></tr></thead><tbody>{[...skills].map(([id, s]) => <tr className="border-t border-[var(--border)]" key={id}><td className="p-2">{s.label}</td><td className="p-2">{s.good.size}</td><td className="p-2">{s.bad}</td></tr>)}</tbody></table></div>}
  </section>;
}
