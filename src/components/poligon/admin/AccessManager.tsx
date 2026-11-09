"use client";

/** Тренер: кому открыт полигон. Поиск по имени и переключатель доступа. */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

type Student = { id: string; name: string; access: boolean; lessonsDone: number };

export function AccessManager({ students }: { students: Student[] }) {
  const [list, setList] = useState(students);
  const [q, setQ] = useState("");
  const router = useRouter();

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    // Без поиска — только те, у кого доступ уже есть; с поиском — все совпадения
    return list.filter((x) => (s ? x.name.toLowerCase().includes(s) : x.access));
  }, [list, q]);

  async function toggle(st: Student) {
    const res = await fetch("/api/admin/poligon/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: st.id, access: !st.access }),
    }).catch(() => null);
    if (!res?.ok) return toast.error("Не получилось изменить доступ");
    setList((l) => l.map((x) => (x.id === st.id ? { ...x, access: !x.access } : x)));
    toast.success(!st.access ? `${st.name}: полигон открыт` : `${st.name}: доступ закрыт`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти ученика, чтобы открыть доступ…" />
      {shown.length === 0 && (
        <p className="text-[14px] text-[var(--text-3)]">{q ? "Никого не нашли." : "Пока никому не открыт. Найди ученика через поиск."}</p>
      )}
      <ul className="flex flex-col gap-1.5">
        {shown.map((st) => (
          <li key={st.id} className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] bg-[var(--surface-muted)] px-3 py-2">
            <span className="min-w-0 truncate text-[15px] text-[var(--text)]">
              {st.name}
              {st.access && <span className="ml-2 text-[13px] text-[var(--text-3)]">уроков: {st.lessonsDone}</span>}
            </span>
            <Button size="sm" variant={st.access ? "outline" : "admin"} onClick={() => toggle(st)}>
              {st.access ? "Закрыть доступ" : "Открыть"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
