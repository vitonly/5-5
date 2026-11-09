"use client";

/*
 * Пульт тренера для практики на ПК: выбрать ученика и неисправность, запустить таймер,
 * отметить «нашёл» и «устранил», подсказки и утилиты.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PC_FAULTS, PC_UTILITIES } from "@/content/poligon/pc-faults";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Run = {
  id: string;
  userName: string;
  faultId: string;
  startedAt: string;
  foundAt: string | null;
  fixedAt: string | null;
  hints: number;
  utilities: string[];
  notes: string;
};

const select = "h-10 w-full rounded-[var(--radius-control)] border border-[var(--border-field)] bg-[var(--surface)] px-2 text-[15px] text-[var(--text)]";

function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function PcConsole({ students, active }: { students: { id: string; name: string }[]; active: Run | null }) {
  const router = useRouter();
  const [userId, setUserId] = useState(students[0]?.id ?? "");
  const [faultId, setFaultId] = useState(PC_FAULTS[0].id);
  const [now, setNow] = useState<number | null>(null);
  const [utils, setUtils] = useState<string[]>(active?.utilities ?? []);
  const [notes, setNotes] = useState(active?.notes ?? "");
  const fault = PC_FAULTS.find((f) => f.id === (active?.faultId ?? faultId))!;

  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  async function call(url: string, method: string, body?: object) {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
    if (!res?.ok) {
      toast.error("Не получилось — проверь интернет");
      return false;
    }
    router.refresh();
    return true;
  }

  if (!active) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 min-[720px]:grid-cols-2">
          <label className="flex flex-col gap-1 text-[14px] text-[var(--text-2)]">
            Ученик
            <select className={select} value={userId} onChange={(e) => setUserId(e.target.value)}>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[14px] text-[var(--text-2)]">
            Неисправность
            <select className={select} value={faultId} onChange={(e) => setFaultId(e.target.value)}>
              {PC_FAULTS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.category}: {f.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <FaultCard fault={fault} />
        <div>
          <Button size="lg" disabled={!userId} onClick={() => call("/api/admin/poligon/pc", "POST", { userId, faultId })}>
            Неисправность внесена — старт
          </Button>
        </div>
      </div>
    );
  }

  const start = new Date(active.startedAt).getTime();
  const found = active.foundAt ? new Date(active.foundAt).getTime() : null;
  const fixed = active.fixedAt ? new Date(active.fixedAt).getTime() : null;
  const searchMs = (found ?? now ?? start) - start;
  const fixMs = found ? (fixed ?? now ?? found) - found : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className={cn("surface-card p-4", searchMs > 20 * 60000 && "border-[var(--danger-border)]")}>
          <p className="text-[13px] text-[var(--text-3)]">Поиск (норма — 20 мин)</p>
          <p className="font-mono-num text-[32px] font-bold text-[var(--text)]">{now === null ? "…" : clock(searchMs)}</p>
        </div>
        <div className={cn("surface-card p-4", fixMs >= 10 * 60000 && "border-[var(--danger-border)]")}>
          <p className="text-[13px] text-[var(--text-3)]">Устранение (норма — до 10 мин)</p>
          <p className="font-mono-num text-[32px] font-bold text-[var(--text)]">{found ? clock(fixMs) : "—"}</p>
        </div>
      </div>
      <p className="text-[15px] text-[var(--text)]">
        <b>{active.userName}</b> · {fault.title}. Симптом для ученика: «{fault.symptom}»
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="success" disabled={!!found} onClick={() => call(`/api/admin/poligon/pc/${active.id}`, "PATCH", { action: "found" })}>
          Нашёл причину
        </Button>
        <Button variant="success" disabled={!!fixed} onClick={() => call(`/api/admin/poligon/pc/${active.id}`, "PATCH", { action: "fixed" })}>
          Устранил
        </Button>
        <Button variant="outline" onClick={() => call(`/api/admin/poligon/pc/${active.id}`, "PATCH", { action: "hint" })}>
          Дал подсказку ({active.hints})
        </Button>
      </div>
      <div>
        <p className="mb-1 text-[14px] font-semibold text-[var(--text)]">Какие утилиты использовал</p>
        <div className="flex flex-wrap gap-1.5">
          {PC_UTILITIES.map((u) => (
            <Button key={u} size="sm" variant={utils.includes(u) ? "success" : "outline"} onClick={() => setUtils((x) => (x.includes(u) ? x.filter((y) => y !== u) : [...x, u]))}>
              {u}
            </Button>
          ))}
        </div>
      </div>
      <Textarea rows={3} placeholder="Заметки: что делал, где ошибся" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <FaultCard fault={fault} />
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={async () => {
            if (await call(`/api/admin/poligon/pc/${active.id}`, "PATCH", { action: "save", utilities: utils, notes })) toast.success("Сохранено");
          }}
        >
          Сохранить
        </Button>
        <Button
          variant="admin"
          onClick={async () => {
            if (await call(`/api/admin/poligon/pc/${active.id}`, "PATCH", { action: "finish", utilities: utils, notes })) toast.success("Попытка закончена");
          }}
        >
          Закончить попытку
        </Button>
        <Button variant="ghost" onClick={() => call(`/api/admin/poligon/pc/${active.id}`, "DELETE")}>
          Удалить попытку
        </Button>
      </div>
    </div>
  );
}

function FaultCard({ fault }: { fault: (typeof PC_FAULTS)[number] }) {
  return (
    <div className="surface-card flex flex-col gap-2 p-4 text-[14px]">
      {fault.hardware && (
        <p className="rounded-[var(--radius-control)] bg-[var(--danger-bg)] px-3 py-1.5 text-[var(--danger)]">
          Работа с кабелями или внутри корпуса — только на выключенном и обесточенном ПК.
        </p>
      )}
      <p className="font-semibold text-[var(--text)]">Как внести</p>
      <ol className="flex list-decimal flex-col gap-0.5 pl-5 text-[var(--text-2)]">
        {fault.inject.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ol>
      <p>
        <b className="text-[var(--text)]">Правильное устранение:</b> <span className="text-[var(--text-2)]">{fault.fix}</span>
      </p>
      <p>
        <b className="text-[var(--text)]">Как проверить:</b> <span className="text-[var(--text-2)]">{fault.check}</span>
      </p>
    </div>
  );
}
