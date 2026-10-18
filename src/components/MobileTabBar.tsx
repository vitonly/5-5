"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { isNavActive } from "@/lib/nav-active";

type Tab = {
  href: string;
  label: string;
  match: (path: string) => boolean;
  icon: "home" | "hw" | "mat" | "match" | "profile" | "admin" | "students" | "points" | "more";
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
    case "more":
      return (
        <svg {...common}>
          <circle cx="5.5" cy="12" r="1.4" fill={stroke} />
          <circle cx="12" cy="12" r="1.4" fill={stroke} />
          <circle cx="18.5" cy="12" r="1.4" fill={stroke} />
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

type MoreItem = { href: string; label: string; badge?: number };

/**
 * Нижняя панель на телефоне. Последний пункт может быть «Ещё» — он открывает лист
 * со второстепенными разделами (вместо прежней прокручиваемой полоски под шапкой).
 */
export function MobileTabBar({
  tabs,
  more = [],
}: {
  more?: MoreItem[];
  tabs: Array<{
    href: string;
    label: string;
    icon: Tab["icon"];
    badge?: number;
    matchPrefix?: string;
    alsoMatch?: string[];
    exact?: boolean;
  }>;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreHrefs = more.map((m) => m.href);
  const moreActive = more.some((m) => isNavActive(pathname, search, m.href, moreHrefs));
  const moreBadge = more.reduce((s, m) => s + (m.badge ?? 0), 0);

  // Лист закрывается при переходе на другую страницу (сброс состояния при смене адреса, без эффекта) и по Esc
  const routeKey = `${pathname}?${search?.toString() ?? ""}`;
  const [openedAt, setOpenedAt] = useState(routeKey);
  if (openedAt !== routeKey) {
    setOpenedAt(routeKey);
    if (moreOpen) setMoreOpen(false);
  }
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMoreOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  const resolved: Tab[] = tabs.map((t) => ({
    href: t.href,
    label: t.label,
    icon: t.icon,
    badge: t.badge,
    match: (path: string) => {
      if (t.alsoMatch?.some((p) => path === p || path.startsWith(p + "/"))) return true;
      if (t.exact || t.href === "/") return path === t.href;
      const prefix = t.matchPrefix ?? t.href;
      return path === prefix || path.startsWith(prefix + "/");
    },
  }));

  const item = (label: string, icon: Tab["icon"], active: boolean, badge?: number) => (
    <>
      <span
        className={`relative flex h-7 w-14 items-center justify-center rounded-full transition-colors duration-[200ms] ${
          active ? "bg-[var(--nav-accent-bg)]" : "bg-transparent"
        }`}
      >
        <TabIcon name={icon} active={active} />
        {badge != null && badge > 0 && (
          <span className="absolute right-1.5 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--danger)] px-1 font-mono-num text-[10px] font-bold leading-none text-white ring-2 ring-[var(--surface)]">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      <span className="max-w-full truncate">{label}</span>
    </>
  );
  const cellCls = (active: boolean) =>
    `press relative flex min-h-[58px] w-full flex-col items-center justify-center gap-1 px-1 pt-1 text-[11px] font-medium transition-colors duration-[160ms] ${
      active ? "text-[var(--nav-accent)]" : "text-[var(--text-3)]"
    }`;

  return (
    <>
      {/* Лист «Ещё»: затемнение + панель над нижним меню */}
      {more.length > 0 && (
        <div
          className={`fixed inset-0 z-[45] min-[720px]:hidden ${moreOpen ? "" : "pointer-events-none"}`}
          aria-hidden={!moreOpen}
        >
          <button
            type="button"
            tabIndex={-1}
            aria-label="Закрыть меню"
            onClick={() => setMoreOpen(false)}
            className={`absolute inset-0 bg-black/30 transition-opacity duration-[200ms] ${moreOpen ? "opacity-100" : "opacity-0"}`}
          />
          <div
            id="mobile-more-sheet"
            role="dialog"
            aria-label="Ещё разделы"
            inert={!moreOpen}
            className={`absolute inset-x-0 bottom-[calc(58px+env(safe-area-inset-bottom,0px))] rounded-t-[var(--radius-card)] border-t border-[var(--border)] bg-[var(--surface)] p-2 shadow-[var(--shadow-popover)] transition-[transform,opacity] duration-[220ms] ease-[cubic-bezier(0.23,1,0.32,1)] ${
              moreOpen ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
            }`}
          >
            <ul className="mx-auto grid max-w-lg grid-cols-2 gap-1">
              {more.map((m) => {
                const active = isNavActive(pathname, search, m.href, moreHrefs);
                return (
                  <li key={m.href}>
                    <Link
                      href={m.href}
                      onClick={() => setMoreOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={`press flex min-h-12 items-center justify-between gap-2 rounded-[var(--radius-control)] px-3.5 text-[15px] font-medium ${
                        active
                          ? "bg-[var(--nav-accent-bg)] text-[var(--nav-accent)]"
                          : "text-[var(--text)] hover:bg-[var(--control)]"
                      }`}
                    >
                      <span className="truncate">{m.label}</span>
                      {m.badge ? (
                        <span className="rounded-full bg-[var(--danger)] px-1.5 font-mono-num text-[11px] font-bold text-white">
                          {m.badge > 9 ? "9+" : m.badge}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border)] bg-[var(--surface)]/90 backdrop-blur-md backdrop-saturate-150 min-[720px]:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        aria-label="Основная навигация"
      >
        <ul className="mx-auto flex max-w-lg items-stretch px-1">
          {resolved.map((tab) => {
            const active = !moreOpen && tab.match(pathname);
            return (
              <li key={tab.href} className="flex-1">
                <Link href={tab.href} aria-current={active ? "page" : undefined} className={cellCls(active)}>
                  {item(tab.label, tab.icon, active, tab.badge)}
                </Link>
              </li>
            );
          })}
          {more.length > 0 && (
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                aria-expanded={moreOpen}
                aria-controls="mobile-more-sheet"
                className={cellCls(moreOpen || moreActive)}
              >
                {item("Ещё", "more", moreOpen || moreActive, moreBadge)}
              </button>
            </li>
          )}
        </ul>
      </nav>
    </>
  );
}
