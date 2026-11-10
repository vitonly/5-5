"use client";

/*
 * Тренер: кнопки на странице диагностики.
 * «Скопировать для Claude» — весь тест одним текстом (вопросы, ответы, автооценка, ключи),
 * его вставляешь в чат с Claude, он оценивает развёрнутые ответы и собирает план.
 * «Сбросить попытку» — ученик сможет пройти тест заново.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { confirmAction } from "@/components/ui/confirm";

export function DiagAdminActions({ userId, text }: { userId: string; text: string }) {
  const router = useRouter();
  const [show, setShow] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Скопировано — вставь в чат с Claude");
    } catch {
      // Буфер обмена недоступен — показываем текст, чтобы выделить вручную
      setShow(true);
    }
  }

  async function reset() {
    if (!(await confirmAction("Сбросить диагностику? Все ответы ученика удалятся, он пройдёт тест заново."))) return;
    const res = await fetch(`/api/admin/poligon/diag/${userId}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) return toast.error("Не получилось сбросить");
    toast.success("Попытка сброшена");
    router.refresh();
  }

  return (
    <div className="mb-6 flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button onClick={copy}>Скопировать для Claude</Button>
        <Button variant="outline" onClick={() => setShow((s) => !s)}>
          {show ? "Скрыть текст" : "Показать текст"}
        </Button>
        <Button variant="ghost" onClick={reset}>
          Сбросить попытку
        </Button>
      </div>
      {show && (
        <textarea
          readOnly
          value={text}
          className="min-h-[320px] w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-muted)] p-3 font-mono text-[12px] text-[var(--text)]"
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
    </div>
  );
}
