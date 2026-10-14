"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

export type ProfileTab = { id: string; label: string; content: React.ReactNode };

function resolveTab(tabs: ProfileTab[], raw: string | null | undefined) {
  return tabs.find((t) => t.id === raw)?.id ?? tabs[0]?.id ?? "";
}

function ProfileTabsInner({ tabs, initial }: { tabs: ProfileTab[]; initial?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab");
  const fromUrl = resolveTab(tabs, urlTab ?? initial);

  const [value, setValue] = useState(fromUrl);

  // Ссылки «?tab=…» и навбар обновляют searchParams — подхватываем без перемонтирования
  useEffect(() => {
    setValue(fromUrl);
  }, [fromUrl]);

  function onChange(v: string) {
    setValue(v);
    const params = new URLSearchParams(searchParams.toString());
    if (v === tabs[0]?.id) params.delete("tab");
    else params.set("tab", v);
    const q = params.toString();
    // router.replace держит Next.js в курсе URL (в отличие от history.replaceState)
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }

  return (
    <Tabs.Root value={value} onValueChange={onChange}>
      <div className="sticky top-[97px] z-30 -mx-4 bg-[var(--bg)]/90 px-4 py-2 backdrop-blur-md min-[720px]:static min-[720px]:mx-0 min-[720px]:bg-transparent min-[720px]:px-0 min-[720px]:py-0 min-[720px]:backdrop-blur-none">
        <Tabs.List
          aria-label="Разделы профиля"
          className="no-scrollbar flex gap-1 overflow-x-auto rounded-[var(--radius-control)] bg-[var(--control)] p-1 min-[720px]:inline-flex"
        >
          {tabs.map((t) => (
            <Tabs.Trigger
              key={t.id}
              value={t.id}
              className="press min-h-[40px] flex-1 whitespace-nowrap rounded-[var(--radius-sm)] px-4 text-sm font-medium text-[var(--text-2)] transition-[background-color,color,box-shadow] duration-[200ms] hover:text-[var(--text)] data-[state=active]:bg-[var(--surface)] data-[state=active]:text-[var(--text)] data-[state=active]:shadow-[var(--shadow-xs)] min-[720px]:flex-none"
            >
              {t.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </div>
      {tabs.map((t) => (
        <Tabs.Content key={t.id} value={t.id} className="rise-in mt-5 space-y-6 focus-visible:outline-none">
          {t.content}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}

/** Вкладки профиля: сегментный переключатель, липнет под шапкой; вкладка пишется в ?tab=. */
export function ProfileTabs({ tabs, initial }: { tabs: ProfileTab[]; initial?: string }) {
  const fallbackId = resolveTab(tabs, initial);
  return (
    <Suspense
      fallback={
        <div className="sticky top-[97px] z-30 -mx-4 bg-[var(--bg)]/90 px-4 py-2 min-[720px]:static min-[720px]:mx-0 min-[720px]:bg-transparent min-[720px]:px-0 min-[720px]:py-0">
          <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-[var(--radius-control)] bg-[var(--control)] p-1 min-[720px]:inline-flex">
            {tabs.map((t) => (
              <div
                key={t.id}
                className={`min-h-[40px] flex-1 whitespace-nowrap rounded-[var(--radius-sm)] px-4 text-sm font-medium leading-[40px] min-[720px]:flex-none ${
                  t.id === fallbackId
                    ? "bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-xs)]"
                    : "text-[var(--text-2)]"
                }`}
              >
                {t.label}
              </div>
            ))}
          </div>
        </div>
      }
    >
      <ProfileTabsInner tabs={tabs} initial={initial} />
    </Suspense>
  );
}
