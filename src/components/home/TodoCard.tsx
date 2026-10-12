import Link from "next/link";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type TodoItem = {
  key: string;
  href: string;
  title: string;
  meta?: string;
  tone: "danger" | "warning" | "points";
};

const DOT: Record<TodoItem["tone"], string> = {
  danger: "bg-[var(--danger)]",
  warning: "bg-[var(--warning)]",
  points: "bg-[var(--points)]",
};

export function TodoCard({ items }: { items: TodoItem[] }) {
  return (
    <div className="surface-card overflow-hidden">
      <p className="eyebrow px-4 pb-1 pt-4">Твои дела</p>
      {items.length === 0 ? (
        <p className="px-4 pb-4 pt-1 text-sm text-[var(--text-2)]">
          Всё сделано. Можно посмотреть новые видео.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border-soft)]">
          {items.map((it) => (
            <li key={it.key}>
              <Link
                href={it.href}
                className="flex min-h-[48px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--surface-muted)]"
              >
                <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT[it.tone])} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-[var(--text)]">{it.title}</span>
                  {it.meta && <span className="block text-[12px] text-[var(--text-3)]">{it.meta}</span>}
                </span>
                <span className="text-[var(--text-3)]" aria-hidden>
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function homeworkTodo(a: {
  id: string;
  status: string;
  deadline: Date;
  revisionDeadline: Date | null;
  homework: { title: string };
}): TodoItem {
  const due = a.status === "REVISION" && a.revisionDeadline ? a.revisionDeadline : a.deadline;
  const tone: TodoItem["tone"] =
    a.status === "OVERDUE" ? "danger" : a.status === "REVISION" ? "warning" : "points";
  const meta =
    a.status === "OVERDUE"
      ? `Просрочено · дедлайн был ${formatShortDate(due)}`
      : a.status === "REVISION"
        ? `На доработке · до ${formatShortDate(due)}`
        : `Домашка · до ${formatShortDate(due)}`;
  return { key: a.id, href: "/homework", title: a.homework.title, meta, tone };
}
