import * as React from "react";
import { cn } from "@/lib/utils";

/* Поле ввода: рамка border-field (3:1), фокус — рамка points + мягкое кольцо points-bg. */
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex h-[46px] w-full rounded-[var(--radius-control)] border border-[var(--border-field)] bg-[var(--surface)] px-3 py-2 text-[15px] text-[var(--text)] shadow-[var(--shadow-xs)] transition-[border-color,box-shadow] duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] placeholder:text-[var(--text-4)] focus-visible:border-[var(--points)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--points-bg)] disabled:cursor-not-allowed disabled:bg-[var(--surface-muted)] disabled:opacity-60 aria-[invalid=true]:border-[var(--danger)] min-[720px]:h-11",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Input.displayName = "Input";
