"use client";

import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { HoldButton } from "@/components/fx/HoldButton";

/** Кнопка «Начать»: создаёт попытку, с этого момента идёт таймер. Нужно удержать — чтобы не запустить таймер случайно */
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
  const router = useRouter();

  /** Запуск после удержания кнопки: true — попытка создана (на кнопке появится галочка) */
  async function start() {
    const res = await fetch("/api/poligon/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moduleCode, variantId }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!res?.ok || !data.id) {
      toast.error(data?.error ?? "Не получилось начать");
      return false;
    }
    // Переходим к заданию, когда галочку уже увидели
    setTimeout(() => router.push(`/poligon/attempt/${data.id}`), 600);
    return true;
  }

  return (
    <HoldButton
      size="lg"
      onConfirm={start}
      holdText="Держи — запускаю…"
      loadingText="Запускаем…"
      successText="Поехали!"
      hint={
        championship
          ? `Удерживай. Таймер ${minutesLabel}, жёсткий: после конца времени сдать нельзя`
          : `Удерживай. Таймер ${minutesLabel}, мягкий: сдать можно и позже, опоздание отметится`
      }
    >
      Начать — пошёл таймер
    </HoldButton>
  );
}
