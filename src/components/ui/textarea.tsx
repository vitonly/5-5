import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      "flex min-h-[120px] w-full resize-y rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[15px] text-[var(--text)] placeholder:text-[var(--text-4)] focus-visible:border-[var(--points)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--points)]/20",
      className
    )}
    ref={ref}
    {...props}
  />
));
Textarea.displayName = "Textarea";
