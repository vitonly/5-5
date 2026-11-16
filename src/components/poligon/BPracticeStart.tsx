"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";

const button = "min-h-11 touch-manipulation rounded-[var(--radius-control)] border border-[var(--border)] px-4 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:opacity-50";

/** Режим выбирают до создания попытки; сервер сохраняет его вместе с новым seed. */
export function BPracticeStart({ variantId, retryFrom, label }: {
  variantId: string;
  retryFrom?: string;
  label?: string;
}) {
  const router = useRouter();
  const lock = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function start(learningMode: "guided" | "independent" | "retry") {
    if (lock.current) return;
    lock.current = true;
    setBusy(learningMode);
    try {
      const response = await fetch("/api/poligon/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleCode: "b", variantId, learningMode, ...(retryFrom ? { retryFrom } : {}) }),
      });
      const data = await response.json();
      if (!response.ok || typeof data.id !== "string" || !data.id) {
        throw new Error(typeof data.error === "string" ? data.error : "Не получилось начать попытку");
      }
      router.push(`/poligon/attempt/${encodeURIComponent(data.id)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не получилось начать. Проверь интернет.");
      lock.current = false;
      setBusy(null);
    }
  }

  return <div className="flex flex-col gap-3 text-[var(--text)]" aria-busy={!!busy}>
    {retryFrom ? <>
      <p className="text-sm text-[var(--text-2)]">Повтори ошибки на новых данных. Режим сохранится на всю попытку.</p>
      <button type="button" className={`${button} bg-[var(--points)] text-[var(--on-points)]`} disabled={!!busy} onClick={() => start("retry")}>
        {busy ? "Открываю…" : label ?? "Повторить ошибки"}
      </button>
    </> : <>
      <p className="text-sm text-[var(--text-2)]">{label ?? "Выбери режим перед началом"}. Внутри попытки его изменить нельзя. Если попытка уже начата, откроется она.</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className={`${button} bg-[var(--points)] text-[var(--on-points)]`} disabled={!!busy} onClick={() => start("guided")}>
          {busy === "guided" ? "Открываю…" : "Начать с подсказками"}
        </button>
        <button type="button" className={`${button} bg-[var(--surface)]`} disabled={!!busy} onClick={() => start("independent")}>
          {busy === "independent" ? "Открываю…" : "Начать самостоятельно"}
        </button>
      </div>
      <p className="text-sm text-[var(--text-2)]">В самостоятельном режиме подсказки появятся после разбора. Работу в Excel и PowerPoint выполняй в обоих режимах.</p>
    </>}
  </div>;
}
