import { cn } from "@/lib/utils";

/** Шапка страницы: надзаголовок, заголовок, пояснение и действия справа */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 min-[720px]:mb-8", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && (
          <p className="mt-1.5 max-w-[60ch] text-[14px] leading-relaxed text-[var(--text-2)]">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Плитка с цифрой для сводок вверху страниц */
export function StatTile({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "points" | "danger" | "warning" | "success";
}) {
  const valueColor = {
    default: "text-[var(--text)]",
    points: "text-[var(--points-ink)]",
    danger: "text-[var(--danger)]",
    warning: "text-[var(--warning-ink)]",
    success: "text-[var(--success-ink)]",
  }[tone];
  return (
    <div className="surface-card min-w-0 px-3.5 py-3 min-[720px]:px-4 min-[720px]:py-3.5">
      <p className="truncate text-[12px] font-medium text-[var(--text-3)]">{label}</p>
      <p className={cn("mt-1 truncate font-mono-num text-[20px] font-bold leading-tight min-[720px]:text-[24px]", valueColor)}>
        {value}
      </p>
      {hint && <p className="mt-0.5 truncate text-[12px] text-[var(--text-3)]">{hint}</p>}
    </div>
  );
}
