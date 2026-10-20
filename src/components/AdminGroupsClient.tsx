"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, Trash2, Users } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { confirmAction } from "@/components/ui/confirm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { RecipientGroup, RecipientStudent } from "@/components/RecipientPicker";
import { cn } from "@/lib/utils";

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
          <CardContent className="p-4 sm:p-6">
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
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
