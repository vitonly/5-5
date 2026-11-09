/*
 * Схемы окон программ для уроков: Excel, Word и слайды.
 * Это не скриншоты, а упрощённые рисунки: показывают, куда нажать и что должно получиться.
 */
import type { ExcelFigure, SlideFigure } from "@/lib/poligon/types";
import { cn } from "@/lib/utils";
import { RichText } from "./RichText";

const EXCEL_TABS = ["Файл", "Главная", "Вставка", "Разметка", "Формулы", "Данные", "Вид"];
const LETTERS = "ABCDEFGHIJKLMNOP".split("");

const MARK = {
  bad: "bg-[var(--danger-bg)] text-[var(--danger)] font-semibold",
  ok: "bg-[var(--success-bg)] text-[var(--success-ink)] font-semibold",
  sel: "outline outline-2 -outline-offset-2 outline-[var(--success)] bg-[var(--success-bg)]",
};

function Caption({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <figcaption className="border-t border-[var(--border-soft)] px-3 py-1.5 text-[13px] text-[var(--text-3)]">
      <RichText text={text} />
    </figcaption>
  );
}

export function ExcelMock(f: ExcelFigure) {
  const cols = f.cols ?? LETTERS.slice(0, Math.max(...f.rows.map((r) => r.length), 1));
  const first = f.firstRow ?? 1;
  return (
    <figure className="overflow-hidden rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)]">
      {/* Вкладки и лента */}
      {(f.tab || f.ribbon) && (
        <div className="border-b border-[var(--border)] bg-[var(--surface-muted)]">
          <div className="no-scrollbar flex gap-0.5 overflow-x-auto px-2 pt-1.5 text-[12px]">
            {EXCEL_TABS.map((t) => (
              <span
                key={t}
                className={cn(
                  "whitespace-nowrap rounded-t px-2 py-1",
                  t === f.tab ? "bg-[var(--surface)] font-semibold text-[var(--success-ink)]" : "text-[var(--text-3)]"
                )}
              >
                {t}
              </span>
            ))}
          </div>
          {f.ribbon && (
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto bg-[var(--surface)] px-2 py-2">
              {f.ribbon.map((b) => (
                <span
                  key={b}
                  className={cn(
                    "whitespace-nowrap rounded border px-2 py-1 text-[12px]",
                    b === f.active
                      ? "border-[var(--success)] bg-[var(--success-bg)] font-semibold text-[var(--success-ink)] ring-2 ring-[var(--success)]"
                      : "border-[var(--border-soft)] text-[var(--text-2)]"
                  )}
                >
                  {b}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {/* Строка формул */}
      {(f.cell || f.formula) && (
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-2 py-1 font-mono text-[13px]">
          <span className="min-w-12 rounded border border-[var(--border-soft)] px-1.5 text-center text-[var(--text-2)]">{f.cell ?? ""}</span>
          <span className="italic text-[var(--text-3)]">fx</span>
          <span className="break-all text-[var(--text)]">{f.formula ?? ""}</span>
        </div>
      )}
      {/* Таблица */}
      <div className="relative overflow-x-auto">
        <table className="w-full border-collapse font-mono text-[12.5px]">
          <thead>
            <tr>
              <th className="w-8 border border-[var(--border-soft)] bg-[var(--surface-muted)]" />
              {cols.map((c) => (
                <th key={c} className="border border-[var(--border-soft)] bg-[var(--surface-muted)] px-2 py-0.5 font-normal text-[var(--text-3)]">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {f.rows.map((row, r) => (
              <tr key={r}>
                <td className="border border-[var(--border-soft)] bg-[var(--surface-muted)] px-1 text-center text-[var(--text-3)]">{first + r}</td>
                {cols.map((_, c) => {
                  const m = f.marks?.[`${r},${c}`];
                  return (
                    <td
                      key={c}
                      className={cn(
                        "whitespace-nowrap border border-[var(--border-soft)] px-2 py-0.5 text-[var(--text)]",
                        r === 0 && first === 1 && "font-semibold",
                        m && MARK[m]
                      )}
                    >
                      {row[c] ?? ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Окно-диалог */}
      {f.dialog && (
        <div className="m-3 max-w-[340px] rounded-[var(--radius-control)] border border-[var(--border-field)] bg-[var(--surface)] shadow-[var(--shadow-raised)]">
          <div className="border-b border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-1.5 text-[13px] font-semibold text-[var(--text)]">
            {f.dialog.title}
          </div>
          <ul className="flex flex-col gap-1 px-3 py-2 text-[13px] text-[var(--text-2)]">
            {f.dialog.lines.map((l, i) => (
              <li key={i}>
                <RichText text={l} />
              </li>
            ))}
          </ul>
          {f.dialog.button && (
            <div className="flex justify-end px-3 pb-2">
              <span className="rounded border border-[var(--success)] bg-[var(--success-bg)] px-3 py-0.5 text-[12px] font-semibold text-[var(--success-ink)] ring-2 ring-[var(--success)]">
                {f.dialog.button}
              </span>
            </div>
          )}
        </div>
      )}
      <Caption text={f.caption} />
    </figure>
  );
}

export function WordMock({
  caption,
  ribbon,
  active,
  lines,
}: {
  caption?: string;
  ribbon?: string;
  active?: string;
  lines: { style: "title" | "h1" | "h2" | "p" | "li"; text: string }[];
}) {
  const styles = ["Обычный", "Заголовок 1", "Заголовок 2", "Название", "Список"];
  return (
    <figure className="overflow-hidden rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-muted)]">
      {ribbon && (
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto border-b border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-[12px]">
          <span className="mr-1 font-semibold text-[var(--admin-ink)]">{ribbon}</span>
          {styles.map((st) => (
            <span
              key={st}
              className={cn(
                "whitespace-nowrap rounded border px-2 py-1",
                st === active
                  ? "border-[var(--admin-border)] bg-[var(--admin-bg)] font-semibold text-[var(--admin-ink)] ring-2 ring-[var(--admin-border)]"
                  : "border-[var(--border-soft)] text-[var(--text-2)]"
              )}
            >
              {st}
            </span>
          ))}
        </div>
      )}
      <div className="mx-auto my-3 flex max-w-[520px] flex-col gap-1.5 bg-[var(--surface)] px-6 py-5 shadow-[var(--shadow-xs)]">
        {lines.map((l, i) => (
          <p
            key={i}
            className={cn(
              "text-[var(--text)]",
              l.style === "title" && "text-center text-[15px] font-bold uppercase",
              l.style === "h1" && "mt-2 text-[14px] font-bold",
              l.style === "h2" && "text-[13px] font-semibold",
              l.style === "p" && "text-justify text-[12.5px] leading-snug",
              l.style === "li" && "pl-4 text-[12.5px] leading-snug"
            )}
          >
            {l.text}
          </p>
        ))}
      </div>
      <Caption text={caption} />
    </figure>
  );
}

export function SlidesMock({ caption, items }: { caption?: string; items: SlideFigure[] }) {
  return (
    <figure className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)]">
      <div className="grid gap-3 p-3 min-[640px]:grid-cols-2">
        {items.map((s, i) => (
          <div key={i} className="flex flex-col gap-1">
            <span className={cn("text-[12px] font-semibold", s.tone === "good" ? "text-[var(--success-ink)]" : "text-[var(--danger)]")}>
              {s.tone === "good" ? "✓ " : "✗ "}
              {s.label}
            </span>
            <div
              className={cn(
                "flex aspect-[16/9] max-w-full flex-col gap-2 overflow-hidden rounded border p-3",
                s.tone === "good" ? "border-[var(--success-border)]" : "border-[var(--danger-border)]"
              )}
            >
              <p className="text-[13px] font-bold leading-tight text-[var(--text)]">{s.title}</p>
              {s.big && (
                <div className="grid flex-1 grid-cols-3 items-center gap-2">
                  {s.big.map((b) => (
                    <div key={b.label} className="text-center">
                      <p className="font-mono-num text-[18px] font-bold text-[var(--points-ink)]">{b.value}</p>
                      <p className="text-[10px] text-[var(--text-3)]">{b.label}</p>
                    </div>
                  ))}
                </div>
              )}
              {s.bars && (
                <div className="flex flex-1 items-end gap-1.5">
                  {s.bars.map((b) => (
                    <div key={b.label} className="flex flex-1 flex-col items-center justify-end gap-0.5">
                      <div className="w-full rounded-t bg-[var(--points-ink)]" style={{ height: `${Math.max(4, b.value) * 0.6}px` }} />
                      <span className="text-[9px] text-[var(--text-3)]">{b.label}</span>
                    </div>
                  ))}
                </div>
              )}
              {s.bullets && (
                <ul className="flex flex-col gap-0.5 pl-3 text-[10.5px] leading-snug text-[var(--text-2)]">
                  {s.bullets.map((b, j) => (
                    <li key={j} className="list-disc">
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>
      <Caption text={caption} />
    </figure>
  );
}
