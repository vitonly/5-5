import { cn } from "@/lib/utils";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "success" | "warning" | "danger" | "points" | "power" | "admin";
}) {
  const variants = {
    default: "bg-[var(--control)] text-[var(--text-2)] border border-[var(--border)]",
    success: "bg-[var(--success-bg)] text-[var(--success)] border border-[var(--success-border)]",
    warning: "bg-[var(--points-bg)] text-[var(--points)] border border-[var(--points-border)]",
    danger: "bg-[var(--danger-bg)] text-[var(--danger)] border border-[var(--danger-border)]",
    points: "bg-[var(--points-bg)] text-[var(--points)] border border-[var(--points-border)]",
    power: "bg-[var(--power-bg)] text-[var(--power)] border border-[var(--power-border)]",
    admin: "bg-[var(--admin-bg)] text-[var(--admin)] border border-[var(--admin-border)]",
  };
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-full px-2.5 text-xs font-medium",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
