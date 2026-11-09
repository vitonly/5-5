"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { confirmAction } from "@/components/ui/confirm";

/** Кнопка «Начать»: создаёт попытку, с этого момента идёт таймер */
export function StartAttemptButton({
  moduleCode,
  variantId,
  championship,
  minutesLabel,
}: {
  moduleCode: string;
  variantId: string;
  championship: boolean;
  minutesLabel: string;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function start() {
    const ok = await confirmAction(
      championship
        ? `Начать прогон? Таймер ${minutesLabel}, жёсткий: после окончания времени сдать будет нельзя.`
        : `Начать задание? Таймер ${minutesLabel}, мягкий: можно сдать и позже, но опоздание будет отмечено.`,
      { confirmLabel: "Начать" }
    );
    if (!ok) return;
    setBusy(true);
    const res = await fetch("/api/poligon/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moduleCode, variantId }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { id?: string; error?: string };
    setBusy(false);
    if (!res?.ok || !data.id) return toast.error(data?.error ?? "Не получилось начать");
    router.push(`/poligon/attempt/${data.id}`);
  }

  return (
    <Button size="lg" onClick={start} disabled={busy}>
      {busy ? "Запускаем…" : "Начать — пошёл таймер"}
    </Button>
  );
}
