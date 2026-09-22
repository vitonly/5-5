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
    <div className="mb-6 flex gap-1 overflow-x-auto rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] p-1">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`min-h-[46px] flex-1 rounded-[6px] px-3 py-2.5 text-center text-sm font-medium transition-colors min-[720px]:min-h-0 ${
              active
                ? "bg-[var(--points-bg)] text-[var(--points)]"
                : "text-[var(--text-2)] hover:bg-[var(--control)]"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
