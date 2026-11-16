"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
export function BOfficialDays({ attemptId, day }: { attemptId: string; day: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function change(action: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/poligon/attempts/${attemptId}/b-day`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось переключить день");
      router.refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка сети"); }
    finally { setBusy(false); }
  }
  return <section className="surface-card my-4 flex flex-col gap-3 p-4">
    <h2 className="text-[18px]">Официальный прогон: день 1 — 4 часа, день 2 — 2 часа</h2>
    <p>Загруженные работы сохраняются. Исходное приложение 9 доступно в тексте задания. Перед завершением дня сохрани и загрузи текущие файлы. После перехода назад в первый день вернуться нельзя.</p>
    {day === "1" && <Button disabled={busy} onClick={() => change("finishDay1")}>Закончить первый день, сохранить работу</Button>}
    {day === "break" && <><p>Перерыв между днями. Работа закрыта для изменений; второй таймер ещё не запущен.</p><Button disabled={busy} onClick={() => change("startDay2")}>Начать второй день — 2 часа</Button></>}
    {day === "2" && <p>Идёт второй день. После его окончания можно сдать в пределах запаса на загрузку.</p>}
  </section>;
}
