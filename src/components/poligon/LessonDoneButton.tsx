"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/** Отметка «урок изучен» — видна в списке уроков и у тренера */
export function LessonDoneButton({ lessonId, initialDone }: { lessonId: string; initialDone: boolean }) {
  const [done, setDone] = useState(initialDone);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function toggle() {
    setBusy(true);
    const res = await fetch("/api/poligon/lessons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lessonId, done: !done }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast.error("Не получилось сохранить. Проверь интернет.");
    setDone(!done);
    router.refresh();
  }

  return (
    <Button variant={done ? "outline" : "success"} onClick={toggle} disabled={busy}>
      {done ? "Изучено ✓ (снять отметку)" : "Я разобрался — отметить изученным"}
    </Button>
  );
}
