import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--points)]/40 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "h-[46px] bg-[var(--points)] px-4 text-white hover:bg-[var(--points-hover)] min-[720px]:h-11",
        secondary:
          "h-[46px] border border-[var(--border)] bg-[var(--control)] px-4 text-[var(--text)] hover:bg-[var(--border-soft)] min-[720px]:h-11",
        admin:
          "h-[46px] bg-[var(--admin)] px-4 text-white hover:brightness-110 focus-visible:ring-[var(--admin)]/40 min-[720px]:h-11",
        destructive:
          "h-[46px] border border-[var(--danger-border)] bg-transparent px-4 text-[var(--danger)] hover:bg-[var(--danger-bg)] min-[720px]:h-11",
        outline:
          "h-[46px] border border-[var(--border)] bg-[var(--surface)] px-4 text-[var(--text)] hover:bg-[var(--control)] min-[720px]:h-11",
        ghost:
          "h-[46px] px-4 text-[var(--text-2)] hover:bg-[var(--control)] hover:text-[var(--text)] min-[720px]:h-11",
        success:
          "h-[46px] bg-[var(--success)] px-4 text-white hover:brightness-110 min-[720px]:h-11",
      },
      size: {
        default: "h-[46px] px-4 min-[720px]:h-11",
        sm: "h-9 rounded-[var(--radius-control)] px-3 text-[13px]",
        lg: "h-12 px-6 text-base",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = "Button";
