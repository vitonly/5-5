/*
 * История практики на ПК: неисправность, время поиска и устранения, баллы.
 */
import type { PoligonPcRun } from "@prisma/client";
import { PC_FAULTS } from "@/content/poligon/pc-faults";
import { scorePcRun } from "@/lib/poligon/pc-runs";
import { fmtPoints } from "@/lib/poligon/core";
import { Badge } from "@/components/ui/badge";

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });

export function PcRunList({ runs, names }: { runs: PoligonPcRun[]; names?: Record<string, string> }) {
  if (!runs.length) return <p className="text-[14px] text-[var(--text-3)]">Пока попыток нет.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {runs.map((r) => {
        const f = PC_FAULTS.find((x) => x.id === r.faultId);
        const sc = scorePcRun(r);
        return (
          <li key={r.id} className="surface-card flex flex-col gap-1 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[15px] font-medium text-[var(--text)]">
                {names ? `${names[r.userId] ?? "Ученик"} · ` : ""}
                {f?.title ?? r.faultId}
              </span>
              <span className="flex items-center gap-2">
                <span className="font-mono-num text-[14px] font-semibold">
                  {fmtPoints(sc.points)} / {sc.max}
                </span>
                <Badge variant={sc.notes.length ? "warning" : "success"}>{r.done ? "закончено" : "идёт"}</Badge>
              </span>
            </div>
            <span className="text-[13px] text-[var(--text-3)]">
              {dateFmt.format(r.startedAt)} · поиск: {sc.findMin ?? "—"} мин · устранение: {sc.fixMin ?? "—"} мин
            </span>
            {sc.notes.length > 0 && <span className="text-[13px] text-[var(--warning-ink)]">{sc.notes.join("; ")}</span>}
            {r.notes && <span className="text-[13px] text-[var(--text-2)]">Тренер: {r.notes}</span>}
          </li>
        );
      })}
    </ul>
  );
}
