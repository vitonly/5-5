"use client";

import { useState } from "react";

/** Кнопка «Копировать» для формул: ученик вставляет формулу в Excel без опечаток */
export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="shrink-0 rounded-[var(--radius-control)] px-2 py-1 text-[12px] font-medium text-[var(--text-2)] hover:bg-[var(--control)] hover:text-[var(--text)]"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          // буфер обмена недоступен (старый браузер) — ничего страшного, формулу можно выделить вручную
        }
      }}
    >
      {done ? "Скопировано" : "Копировать"}
    </button>
  );
}
