"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { SendToDialog } from "@/components/RecipientPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { confirmAction } from "@/components/ui/confirm";
import { SeriesTable } from "@/components/match/SeriesTable";
import type { SeriesRow } from "@/lib/match-series";

export type ActiveSeries = { id: string; name: string; participantIds: string[] };

/**
 * Мини-сезон 5v5 в панели тренера («Игры по сертификатам»).
 * Здесь его создают, выбирают участников, смотрят таблицу и закрывают.
 * Игры мини-сезона создаются в карточке «Новый 5v5» — там появится выбор «какой 5v5».
 */
export function AdminSeriesCard({
  series,
  table,
  allStudentIds,
}: {
  series: ActiveSeries | null;
  table: SeriesRow[];
  /** все ученики — если в окне выбора нажать «всем» */
  allStudentIds: string[];
}) {
  const router = useRouter();
  const [name, setName] = useState("Игры по сертификатам");
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send(method: "POST" | "PATCH", body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/matches/series", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Не получилось");
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  // Окно выбора отдаёт null, если выбраны «все» — тогда берём всех учеников
  async function saveParticipants(ids: string[] | null) {
    const participantIds = ids ?? allStudentIds;
    const ok = series
      ? await send("PATCH", { seriesId: series.id, action: "setParticipants", participantIds })
      : await send("POST", { name, participantIds });
    if (ok) {
      setPicking(false);
      toast.success(series ? "Участники сохранены" : "Мини-сезон начат");
    }
  }

  async function closeSeries() {
    if (!series) return;
    const yes = await confirmAction(
      `Закрыть мини-сезон «${series.name}»?\nОн пропадёт из 5v5, всё станет как обычно. Таблица и игры сохранятся.`
    );
    if (yes && (await send("PATCH", { seriesId: series.id, action: "close" }))) {
      toast.success("Мини-сезон закрыт");
    }
  }

  const picker = (
    <SendToDialog
      open={picking}
      title="Кто играет в мини-сезоне"
      hint="Приглашения на игры мини-сезона уйдут только им. Тренер может играть всегда."
      sendLabel={series ? "Сохранить" : "Начать мини-сезон"}
      allLabel={series ? "Сохранить: все ученики" : "Начать: все ученики"}
      requireTelegram={false}
      initial={series?.participantIds.length ? series.participantIds : null}
      busy={busy}
      onClose={() => setPicking(false)}
      onSend={saveParticipants}
    />
  );

  if (!series) {
    return (
      <CollapsibleCard
        variant="create"
        title="Мини-сезон"
        description="Несколько суббот со своей таблицей очков — например, «Игры по сертификатам»"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-3)]">
            Очки за победы, ничьи и MVP в играх мини-сезона идут только в его таблицу — общие очки школы
            не меняются. Прогнозов, зала славы и ачивок в этих играх нет.
          </p>
          <div className="max-w-sm">
            <Label>Название</Label>
            <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button disabled={busy || !name.trim()} onClick={() => setPicking(true)}>
            Выбрать участников и начать…
          </Button>
          {picker}
        </div>
      </CollapsibleCard>
    );
  }

  return (
    <CollapsibleCard
      title={`Мини-сезон «${series.name}»`}
      description={`Участников: ${series.participantIds.length} · очки идут в отдельную таблицу`}
      defaultOpen
    >
      <div className="space-y-4">
        <SeriesTable rows={table} />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => setPicking(true)}>
            Участники ({series.participantIds.length})…
          </Button>
          <Button variant="outline" disabled={busy} onClick={closeSeries}>
            Закрыть мини-сезон
          </Button>
        </div>
        <p className="text-xs text-[var(--text-3)]">
          Игру мини-сезона создают в карточке «Новый 5v5» ниже — выберите «{series.name}».
        </p>
        {picker}
      </div>
    </CollapsibleCard>
  );
}
