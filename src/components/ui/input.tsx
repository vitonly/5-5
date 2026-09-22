import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex h-[46px] w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[15px] text-[var(--text)] placeholder:text-[var(--text-4)] focus-visible:border-[var(--points)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--points)]/20 min-[720px]:h-11",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Input.displayName = "Input";
