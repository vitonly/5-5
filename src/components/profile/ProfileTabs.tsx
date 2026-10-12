"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { useState } from "react";

export type ProfileTab = { id: string; label: string; content: React.ReactNode };

/** Вкладки профиля: сегментный переключатель, липнет под шапкой; вкладка пишется в ?tab=. */
export function ProfileTabs({ tabs, initial }: { tabs: ProfileTab[]; initial?: string }) {
  const first = tabs.find((t) => t.id === initial)?.id ?? tabs[0]?.id;
  const [value, setValue] = useState(first);

  function onChange(v: string) {
    setValue(v);
    try {
      const url = new URL(window.location.href);
      if (v === tabs[0]?.id) url.searchParams.delete("tab");
      else url.searchParams.set("tab", v);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* ignore */
    }
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
