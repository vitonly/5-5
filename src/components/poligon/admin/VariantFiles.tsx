"use client";

/*
 * Тренер: приложить исходные файлы к заданию (например, датасет чемпионата).
 * Сами файлы чемпионата в открытый git не кладём — загружаются сюда.
 */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadAppFile } from "@/lib/upload-client";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

type FileRow = { id: string; label: string; url: string };

export function VariantFiles({ variantId, hint, files }: { variantId: string; hint: string; files: FileRow[] }) {
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function add(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const { url } = await uploadAppFile(file);
      const res = await fetch("/api/admin/poligon/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId, url, label: file.name }),
      });
      if (!res.ok) throw new Error("не сохранилось");
      toast.success("Файл приложен");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }

  async function remove(id: string) {
    await fetch("/api/admin/poligon/files", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] text-[var(--text-3)]">Нужно: {hint}</p>
      {files.map((f) => (
        <div key={f.id} className="flex items-center justify-between gap-2 text-[14px]">
          <a href={f.url} className="min-w-0 truncate text-[var(--points-ink)] underline" download>
            {f.label}
          </a>
          <Button variant="ghost" size="sm" onClick={() => remove(f.id)}>
            Убрать
          </Button>
        </div>
      ))}
      <input ref={ref} type="file" className="hidden" onChange={(e) => add(e.target.files?.[0])} />
      <div>
        <Button variant="outline" size="sm" onClick={() => ref.current?.click()} disabled={busy}>
          {busy ? "Загружаю…" : "Приложить файл"}
        </Button>
      </div>
    </div>
  );
}
