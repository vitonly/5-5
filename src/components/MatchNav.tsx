"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/match", label: "Матчи" },
  { href: "/match/seasons", label: "Сезоны" },
  { href: "/match/vote", label: "Голосование" },
];

export function MatchNav() {
  const pathname = usePathname();
  return (
    <div className="no-scrollbar mb-6 flex gap-1 overflow-x-auto rounded-[var(--radius-control)] bg-[var(--control)] p-1">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`press min-h-[44px] flex-1 whitespace-nowrap rounded-[var(--radius-sm)] px-3 py-2.5 text-center text-sm font-medium transition-[background-color,color,box-shadow] duration-[200ms] min-[720px]:min-h-0 ${
              active
                ? "bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-xs)]"
                : "text-[var(--text-2)] hover:text-[var(--text)]"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
