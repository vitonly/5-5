"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Pencil, Trash2, Users, X } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { confirmAction } from "@/components/ui/confirm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { RecipientGroup, RecipientStudent } from "@/components/RecipientPicker";
import { cn } from "@/lib/utils";
import { WEEKDAYS, WEEKDAYS_SHORT, sortSlots, type ScheduleSlot } from "@/lib/schedule";

/* Расписание группы: занятия по дням недели. Каждое изменение сразу сохраняется. */
function ScheduleEditor({ slots, onChange }: { slots: ScheduleSlot[]; onChange: (next: ScheduleSlot[]) => void }) {
  const [weekday, setWeekday] = useState(2);
  const [time, setTime] = useState("18:00");

  function add() {
    if (!time || slots.some((s) => s.weekday === weekday && s.time === time)) return;
    onChange(sortSlots([...slots, { weekday, time }]));
  }

  return (
    <div className="space-y-2">
      <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-3)]">
        <CalendarDays className="h-3.5 w-3.5" aria-hidden /> Расписание
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {slots.length === 0 && <span className="text-sm text-[var(--text-3)]">Пока не задано</span>}
        {slots.map((s) => (
          <span
            key={`${s.weekday}-${s.time}`}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--admin-border)] bg-[var(--admin-bg)] py-1 pl-3 pr-1 text-xs text-[var(--admin-ink)]"
          >
            {WEEKDAYS_SHORT[s.weekday]} {s.time}
            <button
              type="button"
              onClick={() => onChange(slots.filter((x) => x !== s))}
              aria-label={`Убрать занятие ${WEEKDAYS[s.weekday]} ${s.time}`}
              className="rounded-full p-0.5 hover:bg-[var(--surface)]"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={weekday}
          onChange={(e) => setWeekday(Number(e.target.value))}
          aria-label="День недели"
          className="h-9 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-2 text-sm"
        >
          {WEEKDAYS.slice(1).map((w, i) => (
            <option key={w} value={i + 1}>
              {w}
            </option>
          ))}
        </select>
        <Input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          aria-label="Время начала"
          className="h-9 w-28"
        />
        <Button size="sm" variant="secondary" onClick={add} disabled={!time}>
          Добавить
        </Button>
      </div>
    </div>
  );
}

/* Страница «Группы»: тренер создаёт группы и отмечает, какие ученики в них учатся.
   Один ученик может быть сразу в нескольких группах. */

async function api(method: string, body?: unknown) {
  const res = await fetch("/api/groups", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Ошибка");
  return data;
}

export function AdminGroupsClient() {
  const [groups, setGroups] = useState<RecipientGroup[]>([]);
  const [students, setStudents] = useState<RecipientStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  // Всегда свежая копия списка групп: быстрые щелчки подряд не должны работать со старым составом
  const groupsRef = useRef<RecipientGroup[]>([]);
  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  useEffect(() => {
    api("GET")
      .then((d) => {
        setGroups(d.groups);
        setStudents(d.students);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Заменить одну группу в списке её новой версией с сервера
  function replace(g: RecipientGroup) {
    setGroups((prev) => prev.map((x) => (x.id === g.id ? g : x)).sort((a, b) => a.name.localeCompare(b.name, "ru")));
  }

  async function create() {
    try {
      const { group } = await api("POST", { name: newName });
      setGroups((prev) => [...prev, group].sort((a, b) => a.name.localeCompare(b.name, "ru")));
      setNewName("");
      toast.success(`Группа «${group.name}» создана — отметьте в ней учеников`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function rename(g: RecipientGroup) {
    const name = window.prompt("Новое название группы", g.name);
    if (!name || name.trim() === g.name) return;
    try {
      replace((await api("PATCH", { id: g.id, name })).group);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function remove(g: RecipientGroup) {
    if (!(await confirmAction(`Удалить группу «${g.name}»?\nУченики останутся на сайте, удалится только группа.`))) return;
    try {
      await api("DELETE", { id: g.id });
      setGroups((prev) => prev.filter((x) => x.id !== g.id));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // Щелчок по ученику — добавить в группу или убрать из неё (сохраняется сразу).
  // Сохранения идут на сервер строго по очереди: при быстрых щелчках
  // более поздний состав не обгонит более ранний.
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  function toggleMember(groupId: string, studentId: string) {
    const g = groupsRef.current.find((x) => x.id === groupId);
    if (!g) return;
    const memberIds = g.memberIds.includes(studentId)
      ? g.memberIds.filter((id) => id !== studentId)
      : [...g.memberIds, studentId];
    // сразу показываем, не ждём сервер
    groupsRef.current = groupsRef.current.map((x) => (x.id === groupId ? { ...x, memberIds } : x));
    setGroups(groupsRef.current);
    saving.current = saving.current
      .then(() => api("PATCH", { id: g.id, memberIds }))
      .catch((e) => toast.error(`Состав группы не сохранился: ${(e as Error).message}. Обновите страницу.`));
  }

  // Новое расписание группы: сразу показываем и ставим сохранение в ту же очередь
  function setSchedule(groupId: string, schedule: ScheduleSlot[]) {
    groupsRef.current = groupsRef.current.map((x) => (x.id === groupId ? { ...x, schedule } : x));
    setGroups(groupsRef.current);
    saving.current = saving.current
      .then(() => api("PATCH", { id: groupId, schedule }))
      .catch((e) => toast.error(`Расписание не сохранилось: ${(e as Error).message}. Обновите страницу.`));
  }

  if (loading) return <p className="text-sm text-[var(--text-3)]">Загрузка…</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4 sm:p-6">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && newName.trim() && create()}
            placeholder="Название новой группы, например «Вторник 18:00»"
            maxLength={60}
            className="min-w-0 flex-1"
          />
          <Button onClick={create} disabled={!newName.trim()}>
            Создать группу
          </Button>
        </CardContent>
      </Card>

      {groups.length === 0 && (
        <p className="text-sm text-[var(--text-2)]">Групп пока нет. Создайте первую — например, по дню занятий.</p>
      )}

      {groups.map((g) => (
        <Card key={g.id}>
          <CardHeader className="flex-row items-center justify-between gap-2 border-b border-[var(--border-soft)]">
            <CardTitle className="inline-flex items-center gap-2">
              <Users className="h-4 w-4 text-[var(--text-3)]" aria-hidden />
              {g.name}
              <span className="text-sm font-normal text-[var(--text-3)]">· {g.memberIds.length} уч.</span>
            </CardTitle>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => rename(g)} aria-label={`Переименовать группу ${g.name}`}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => remove(g)} aria-label={`Удалить группу ${g.name}`}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 p-4 sm:p-6">
            <ScheduleEditor slots={g.schedule ?? []} onChange={(next) => setSchedule(g.id, next)} />
            <div>
            <p className="mb-3 text-xs text-[var(--text-3)]">Нажмите на ученика, чтобы добавить его в группу или убрать.</p>
            <div className="flex flex-wrap gap-2">
              {students.map((s) => {
                const on = g.memberIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleMember(g.id, s.id)}
                    aria-pressed={on}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition-colors",
                      on
                        ? "border-[var(--admin-border)] bg-[var(--admin-bg)] text-[var(--admin-ink)]"
                        : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)]"
                    )}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
