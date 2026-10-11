import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      "flex min-h-[120px] w-full resize-y rounded-[var(--radius-control)] border border-[var(--border-field)] bg-[var(--surface)] px-3 py-2.5 text-[15px] leading-6 text-[var(--text)] shadow-[var(--shadow-xs)] transition-[border-color,box-shadow] duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] placeholder:text-[var(--text-4)] focus-visible:border-[var(--points)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--points-bg)] aria-[invalid=true]:border-[var(--danger)]",
      className
    )}
    ref={ref}
    {...props}
  />
));
Textarea.displayName = "Textarea";
