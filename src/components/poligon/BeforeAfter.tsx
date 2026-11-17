import { cn } from "@/lib/utils";

/** Подпись у изменённой ячейки объясняет правку даже без различения цветов. */
export function BeforeAfter({ head, before, after, notes = {}, caption }: {
  head: string[]; before: string[][]; after: string[][]; notes?: Record<string, string>; caption?: string;
}) {
  return <figure className="min-w-0">
    <div className="grid min-w-0 gap-4 min-[720px]:grid-cols-2">
      {[["Было", before], ["Стало", after]].map(([title, value], side) => <div key={side} className="min-w-0 overflow-x-auto rounded-[var(--radius-control)] border border-[var(--border)]" role="region" aria-label={String(title)} tabIndex={0}>
        <table className="w-full table-fixed border-collapse text-left text-sm">
          <caption className="bg-[var(--surface-muted)] px-3 py-2 text-left font-semibold text-[var(--text)]">{String(title)}</caption>
          <thead><tr>{head.map((h, i) => <th key={i} scope="col" className="break-words border-b border-[var(--border)] px-3 py-2 [overflow-wrap:anywhere]">{h}</th>)}</tr></thead>
          <tbody>{(value as string[][]).map((row, r) => <tr key={r}>{row.map((cell, c) => {
            const note = side === 1 ? notes[`${r},${c}`] ?? (before[r]?.[c] !== cell ? "Исправлено: сравни с ячейкой в таблице «Было»" : undefined) : undefined;
            return <td key={c} className={cn("break-words border-b border-[var(--border-soft)] px-3 py-2 align-top [overflow-wrap:anywhere]", note && "bg-[var(--success-bg)] text-[var(--success-ink)]")}>
              {cell || "Пусто"}{note && <span className="mt-1 block text-xs font-medium">Изменение: {note}</span>}
            </td>;
          })}</tr>)}</tbody>
        </table>
      </div>)}
    </div>
    {caption && <figcaption className="mt-2 text-sm text-[var(--text-2)]">{caption}</figcaption>}
  </figure>;
}
