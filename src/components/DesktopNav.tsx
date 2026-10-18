"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { isNavActive } from "@/lib/nav-active";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; badge?: number };


function Badge({ n }: { n?: number }) {
  if (!n) return null;
  return (
    <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--danger)] px-1 font-mono-num text-[10px] font-bold leading-none text-white ring-2 ring-[var(--control)]">
      {n > 9 ? "9+" : n}
    </span>
  );
}

const itemClass = (active: boolean) =>
  cn(
    "press relative inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-[var(--radius-sm)] px-2.5 text-[13px] font-medium min-[1000px]:px-3.5 min-[1000px]:text-[14px] transition-[background-color,color,box-shadow] duration-[200ms]",
    active
      ? "bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-xs)]"
      : "text-[var(--text-2)] hover:text-[var(--text)]"
  );

/**
 * Навигация на компьютере — в стиле сегментных переключателей сайта
 * (серая дорожка, активный пункт — белая «таблетка»). Второстепенные разделы — в «Ещё».
 */
export function DesktopNav({ primary, more }: { primary: NavItem[]; more: NavItem[] }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const hrefs = [...primary, ...more].map((i) => i.href);
  const isActive = (_p: string, href: string) => isNavActive(pathname, search, href, hrefs);
  const activeMore = more.find((m) => isActive(pathname, m.href));
  const moreBadge = more.reduce((s, m) => s + (m.badge ?? 0), 0);

  return (
    <nav aria-label="Разделы" className="flex items-center gap-0.5 rounded-[var(--radius-control)] bg-[var(--control)] p-1">
      {primary.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={itemClass(active)}>
            {item.label}
            <Badge n={item.badge} />
          </Link>
        );
      })}

      {more.length > 0 && (
        <Dropdown.Root modal={false}>
          <Dropdown.Trigger className={cn(itemClass(Boolean(activeMore)), "data-[state=open]:text-[var(--text)]")}>
            {activeMore ? activeMore.label : "Ещё"}
            <ChevronDown className="h-3.5 w-3.5 opacity-70 transition-transform duration-[200ms] [[data-state=open]>&]:rotate-180" aria-hidden />
            <Badge n={moreBadge} />
          </Dropdown.Trigger>
          <Dropdown.Portal>
            <Dropdown.Content
              align="end"
              sideOffset={8}
              className="menu-pop z-50 min-w-[200px] rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[var(--shadow-popover)]"
            >
              {more.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Dropdown.Item key={item.href} asChild>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex h-10 cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-sm)] px-3 text-[14px] outline-none transition-colors data-[highlighted]:bg-[var(--control)]",
                        active ? "font-medium text-[var(--nav-accent)]" : "text-[var(--text)]"
                      )}
                    >
                      {item.label}
                      {item.badge ? (
                        <span className="rounded-full bg-[var(--danger)] px-1.5 font-mono-num text-[10px] font-bold text-white">
                          {item.badge > 9 ? "9+" : item.badge}
                        </span>
                      ) : null}
                    </Link>
                  </Dropdown.Item>
                );
              })}
            </Dropdown.Content>
          </Dropdown.Portal>
        </Dropdown.Root>
      )}
    </nav>
  );
}
