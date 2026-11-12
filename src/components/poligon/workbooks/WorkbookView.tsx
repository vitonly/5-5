"use client";

/*
 * Выбирает нужный тренажёр по id тетради.
 * Один компонент и для ученика (заполняет), и для тренера (смотрит, readOnly).
 */
import type { WorkbookId } from "@/lib/poligon/types";
import { A_WORKBOOK_PARTS, type Workbook } from "@/lib/poligon/a-practicum";
import { APracticum } from "./APracticum";
import { BTrainer } from "./BTrainer";
import { VTrainer } from "./VTrainer";

export function WorkbookView({
  id,
  initial,
  readOnly,
  onChange,
}: {
  id: WorkbookId;
  initial: Workbook;
  readOnly?: boolean;
  onChange?: (w: Workbook) => void;
}) {
  const parts = A_WORKBOOK_PARTS[id];
  if (parts) return <APracticum initial={initial} readOnly={readOnly} onChange={onChange} parts={parts} />;
  if (id.startsWith("v-"))
    return <VTrainer id={id as "v-sim" | "v-cmd" | "v-where" | "v-docs"} initial={initial} readOnly={readOnly} onChange={onChange} />;
  return <BTrainer id={id as "b-clean" | "b-calc" | "b-charts" | "b-pres"} initial={initial} readOnly={readOnly} onChange={onChange} />;
}
