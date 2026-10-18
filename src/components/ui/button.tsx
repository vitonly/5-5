import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/*
 * Кнопка СТАРТ+. Одна primary (default) на экран, остальные — secondary / outline / ghost.
 * Нажатие — scale(0.97) за 160ms ease-out; hover только на устройствах с мышью
 * (custom-variant `hover` в globals.css); фокус — кольцо focus-ring 2px.
 */
const buttonVariants = cva(
  "inline-flex touch-manipulation select-none items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] border border-transparent text-[15px] font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 motion-reduce:active:scale-100 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          // Неактивная — серая с читаемым текстом (бледно-бирюзовая с белым текстом была 2.1:1)
          "bg-[var(--points)] text-[var(--on-points)] shadow-[var(--shadow-xs)] hover:bg-[var(--points-hover)] disabled:bg-[var(--control)] disabled:text-[var(--text-3)] disabled:opacity-100 disabled:shadow-none",
        secondary:
          "bg-[var(--control)] text-[var(--text)] hover:bg-[var(--border-soft)]",
        admin:
          "bg-[var(--admin)] text-white shadow-[var(--shadow-xs)] hover:bg-[var(--admin-ink)]",
        destructive:
          "border-[var(--danger-border)] bg-[var(--surface)] text-[var(--danger)] hover:bg-[var(--danger-bg)]",
        outline:
          "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-xs)] hover:border-[var(--border-field)] hover:bg-[var(--surface-muted)]",
        ghost:
          "bg-transparent text-[var(--text-2)] hover:bg-[var(--control)] hover:text-[var(--text)]",
        success:
          "bg-[var(--success)] text-white shadow-[var(--shadow-xs)] hover:bg-[var(--success-ink)]",
      },
      size: {
        default: "h-[46px] px-4 min-[720px]:h-11",
        sm: "h-9 px-3 text-[13px]",
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

export { buttonVariants };
