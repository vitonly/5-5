"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { isNavActive } from "@/lib/nav-active";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; badge?: number };


/** Пункты навигации с подсветкой текущего раздела. */
export function NavLinks({
  items,
  variant = "desktop",
}: {
  items: NavItem[];
  variant?: "desktop" | "strip";
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const hrefs = items.map((i) => i.href);

  return (
    <>
      {items.map((item) => {
        const active = isNavActive(pathname, search, item.href, hrefs);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "press relative shrink-0 whitespace-nowrap rounded-[var(--radius-control)] font-medium transition-colors duration-[160ms]",
              variant === "desktop" ? "px-3 py-2 text-[14px]" : "px-3 py-1.5 text-[13px]",
              active
                ? "bg-[var(--nav-accent-bg)] text-[var(--nav-accent)]"
                : "text-[var(--text-2)] hover:bg-[var(--control)] hover:text-[var(--text)]"
            )}
          >
            {item.label}
            {item.badge != null && item.badge > 0 && (
              <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--danger)] px-1 font-mono-num text-[10px] font-bold leading-none text-white ring-2 ring-[var(--surface)]">
                {item.badge > 9 ? "9+" : item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </>
  );
}
