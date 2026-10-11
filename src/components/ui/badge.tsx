import { cn } from "@/lib/utils";

/* Плашка статуса. Текст на тинте — цветом *-ink (контраст ≥ 5:1). */
export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "success" | "warning" | "danger" | "points" | "power" | "admin";
}) {
  const variants = {
    default: "bg-[var(--control)] text-[var(--text-2)] border-[var(--border)]",
    success: "bg-[var(--success-bg)] text-[var(--success-ink)] border-[var(--success-border)]",
    warning: "bg-[var(--warning-bg)] text-[var(--warning-ink)] border-[var(--warning-border)]",
    danger: "bg-[var(--danger-bg)] text-[var(--danger)] border-[var(--danger-border)]",
    points: "bg-[var(--points-bg)] text-[var(--points-ink)] border-[var(--points-border)]",
    power: "bg-[var(--power-bg)] text-[var(--power-ink)] border-[var(--power-border)]",
    admin: "bg-[var(--admin-bg)] text-[var(--admin-ink)] border-[var(--admin-border)]",
  };
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium leading-none",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
