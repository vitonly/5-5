"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { displayName, formatDate } from "@/lib/utils";
import { POINT_VALUES, formatPoints } from "@/lib/points";

type Student = {
  id: string;
  firstName: string;
  lastName?: string | null;
  username?: string | null;
  photoUrl?: string | null;
};

type Attendance = {
  id: string;
  userId: string;
  present: boolean;
  user: Student;
};

type Session = {
  id: string;
  date: string;
  attendances: Attendance[];
};

function nextWednesdayLocal(): string {
  const d = new Date();
  const day = d.getDay(); // 0 Sun … 3 Wed
  const add = day === 3 ? 0 : (3 - day + 7) % 7;
  const target = new Date(d);
  target.setDate(d.getDate() + add);
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, "0");
  const dd = String(target.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function AdminAttendanceClient() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newDate, setNewDate] = useState(nextWednesdayLocal());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/attendance");
      const data = await res.json();
      setSessions(data.sessions || []);
      setStudents(data.students || []);
      if (!activeId && data.sessions?.[0]) setActiveId(data.sessions[0].id);
    } finally {
      setLoading(false);
    }
  }, [activeId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? null,
    [sessions, activeId]
  );

  const presentSet = useMemo(() => {
    const set = new Set<string>();
    for (const a of active?.attendances ?? []) {
      if (a.present) set.add(a.userId);
    }
    return set;
  }, [active]);

  async function createSession() {
    const res = await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: newDate }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Ошибка");
      return;
    }
    await load();
    setActiveId(data.session.id);
    router.refresh();
  }

  async function toggle(userId: string, present: boolean) {
    if (!active) return;
    setSaving(userId);
    try {
      const res = await fetch("/api/attendance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: active.id, userId, present }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Ошибка");
        return;
      }
      await load();
      router.refresh();
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-[var(--text-3)]">Загрузка…</p>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Новое занятие</CardTitle>
          <p className="text-sm text-[var(--text-3)]">
            Обычно среда. Отмеченные получают +{formatPoints(POINT_VALUES.LESSON_ATTEND)} к очкам
            платформы. Снятие отметки откатывает очки.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <Label>Дата</Label>
            <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          </div>
          <Button onClick={() => void createSession()}>Создать / открыть</Button>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {sessions.map((s) => (
          <Button
            key={s.id}
            size="sm"
            variant={s.id === activeId ? "default" : "outline"}
            onClick={() => setActiveId(s.id)}
          >
            {formatDate(s.date).replace(/ в .+$/, "")} ·{" "}
            {s.attendances.filter((a) => a.present).length}/{students.length}
          </Button>
        ))}
      </div>

      {active ? (
        <Card>
          <CardHeader>
            <CardTitle>Посещаемость · {formatDate(active.date)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {students.map((st) => {
              const on = presentSet.has(st.id);
              return (
                <label
                  key={st.id}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5"
                >
                  <span className="font-medium text-[var(--text)]">{displayName(st)}</span>
                  <span className="flex items-center gap-2">
                    {saving === st.id && (
                      <span className="text-xs text-[var(--text-4)]">…</span>
                    )}
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-[var(--points)]"
                      checked={on}
                      disabled={saving === st.id}
                      onChange={(e) => void toggle(st.id, e.target.checked)}
                    />
                    <span
                      className={`font-mono-num text-xs ${
                        on ? "text-[var(--success)]" : "text-[var(--text-4)]"
                      }`}
                    >
                      {on ? `+${formatPoints(POINT_VALUES.LESSON_ATTEND)}` : "нет"}
                    </span>
                  </span>
                </label>
              );
            })}
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-[var(--text-3)]">Создайте занятие, чтобы отметить учеников.</p>
      )}
    </div>
  );
}
