"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = {
  href: string;
  label: string;
  match: (path: string) => boolean;
  icon: "home" | "hw" | "mat" | "match" | "profile" | "admin" | "students" | "points";
  badge?: number;
};

function TabIcon({ name, active }: { name: Tab["icon"]; active: boolean }) {
  const stroke = active ? "var(--nav-accent)" : "var(--text-3)";
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke,
    strokeWidth: active ? 2 : 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z" />
        </svg>
      );
    case "hw":
      return (
        <svg {...common}>
          <path d="M8 4h8a2 2 0 0 1 2 2v14l-6-3-6 3V6a2 2 0 0 1 2-2z" />
        </svg>
      );
    case "mat":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M10 9.5v5l4.5-2.5L10 9.5z" fill={stroke} stroke="none" />
        </svg>
      );
    case "match":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 4v16M4 12h16" />
        </svg>
      );
    case "profile":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 19.5c1.8-3.2 4.2-4.5 7-4.5s5.2 1.3 7 4.5" />
        </svg>
      );
    case "admin":
      return (
        <svg {...common}>
          <path d="M4 13h6v7H4zM14 4h6v16h-6zM4 4h6v6H4z" />
        </svg>
      );
    case "students":
      return (
        <svg {...common}>
          <circle cx="9" cy="9" r="3" />
          <circle cx="16" cy="10" r="2.5" />
          <path d="M3.5 19c1.2-2.4 3-3.5 5.5-3.5s4.3 1.1 5.5 3.5M13 19c.7-1.5 1.8-2.2 3.5-2.2" />
        </svg>
      );
    case "points":
      return (
        <svg {...common}>
          <path d="M12 3 14.5 9H21l-5 4 2 7-6-4-6 4 2-7-5-4h6.5L12 3z" />
        </svg>
      );
  }
}

export function MobileTabBar({
  tabs,
}: {
  tabs: Array<{
    href: string;
    label: string;
    icon: Tab["icon"];
    badge?: number;
    matchPrefix?: string;
    exact?: boolean;
  }>;
}) {
  const pathname = usePathname();

  const resolved: Tab[] = tabs.map((t) => ({
    href: t.href,
    label: t.label,
    icon: t.icon,
    badge: t.badge,
    match: (path: string) => {
      if (t.exact || t.href === "/") return path === t.href;
      const prefix = t.matchPrefix ?? t.href;
      return path === prefix || path.startsWith(prefix + "/");
    },
  }));

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border)] bg-[var(--surface)]/90 backdrop-blur-md backdrop-saturate-150 min-[720px]:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Основная навигация"
    >
      <ul className="mx-auto flex max-w-lg items-stretch px-1">
        {resolved.map((tab) => {
          const active = tab.match(pathname);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`press relative flex min-h-[58px] flex-col items-center justify-center gap-1 px-1 pt-1 text-[11px] font-medium transition-colors duration-[160ms] ${
                  active ? "text-[var(--nav-accent)]" : "text-[var(--text-3)]"
                }`}
              >
                <span
                  className={`relative flex h-7 w-14 items-center justify-center rounded-full transition-colors duration-[200ms] ${
                    active ? "bg-[var(--nav-accent-bg)]" : "bg-transparent"
                  }`}
                >
                  <TabIcon name={tab.icon} active={active} />
                  {tab.badge != null && tab.badge > 0 && (
                    <span className="absolute right-1.5 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--danger)] px-1 font-mono-num text-[10px] font-bold leading-none text-white ring-2 ring-[var(--surface)]">
                      {tab.badge > 9 ? "9+" : tab.badge}
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
