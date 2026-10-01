"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { displayName, formatDateOnly } from "@/lib/utils";
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
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(true);

  /** Local checkbox overrides before/while server sync */
  const [localPresent, setLocalPresent] = useState<Record<string, boolean>>({});
  const pendingRef = useRef<Map<string, boolean>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushChainRef = useRef<Promise<void>>(Promise.resolve());
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/attendance");
      const data = await res.json();
      setSessions(data.sessions || []);
      setStudents(data.students || []);
      setActiveId((prev) => prev ?? data.sessions?.[0]?.id ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const active = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? null,
    [sessions, activeId]
  );

  const presentSet = useMemo(() => {
    const set = new Set<string>();
    for (const a of active?.attendances ?? []) {
      if (a.present) set.add(a.userId);
    }
    for (const [uid, on] of Object.entries(localPresent)) {
      if (on) set.add(uid);
      else set.delete(uid);
    }
    return set;
  }, [active, localPresent]);

  useEffect(() => {
    // Clear local overrides when switching session
    setLocalPresent({});
    pendingRef.current.clear();
    setListOpen(true);
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, [activeId]);

  const flushPending = useCallback(async () => {
    const sessionId = activeIdRef.current;
    if (!sessionId) return;

    const snapshot = new Map(pendingRef.current);
    if (snapshot.size === 0) return;
    pendingRef.current.clear();

    setSyncing(true);
    setSyncError(null);
    try {
      const updates = [...snapshot.entries()].map(([userId, present]) => ({
        userId,
        present,
      }));
      const res = await fetch("/api/attendance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, updates }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Re-queue failed updates
        for (const [uid, present] of snapshot) {
          if (!pendingRef.current.has(uid)) pendingRef.current.set(uid, present);
        }
        setSyncError(data.error || "Не удалось сохранить");
        return;
      }
      if (data.session) {
        setSessions((prev) =>
          prev.map((s) => (s.id === data.session.id ? data.session : s))
        );
        // Drop local overrides that match server after sync
        setLocalPresent((prev) => {
          const next = { ...prev };
          for (const [uid, present] of snapshot) {
            if (next[uid] === present && !pendingRef.current.has(uid)) {
              delete next[uid];
            }
          }
          return next;
        });
      }
      router.refresh();
    } catch {
      for (const [uid, present] of snapshot) {
        if (!pendingRef.current.has(uid)) pendingRef.current.set(uid, present);
      }
      setSyncError("Сеть: не удалось сохранить");
    } finally {
      setSyncing(false);
      // If more toggles arrived during flush — schedule another
      if (pendingRef.current.size > 0) {
        flushTimerRef.current = setTimeout(() => {
          flushChainRef.current = flushChainRef.current.then(() => flushPending());
        }, 200);
      }
    }
  }, [router]);

  function scheduleFlush() {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => {
      flushChainRef.current = flushChainRef.current.then(() => flushPending());
    }, 600);
  }

  function toggle(userId: string, present: boolean) {
    if (!active) return;
    setLocalPresent((prev) => ({ ...prev, [userId]: present }));
    pendingRef.current.set(userId, present);
    setSyncError(null);
    scheduleFlush();
  }

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

  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, []);

  if (loading) {
    return <p className="text-sm text-[var(--text-3)]">Загрузка…</p>;
  }

  const pendingCount = Object.keys(localPresent).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Новое занятие</CardTitle>
          <p className="text-sm text-[var(--text-3)]">
            Отмечайте всех сразу — очки (+{formatPoints(POINT_VALUES.LESSON_ATTEND)})
            начислятся пакетом через мгновение. Снятие отметки откатывает очки.
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

      <div className="flex flex-wrap items-center gap-2">
        {sessions.map((s) => (
          <Button
            key={s.id}
            size="sm"
            variant={s.id === activeId ? "default" : "outline"}
            onClick={() => setActiveId(s.id)}
          >
            {formatDateOnly(s.date)} ·{" "}
            {(s.id === activeId
              ? presentSet.size
              : s.attendances.filter((a) => a.present).length)}
            /{students.length}
          </Button>
        ))}
        {syncing && (
          <span className="text-xs text-[var(--text-4)]">Сохранение очков…</span>
        )}
        {!syncing && pendingCount > 0 && (
          <span className="text-xs text-[var(--text-4)]">Ожидание…</span>
        )}
        {syncError && (
          <button
            type="button"
            className="text-xs text-[var(--danger)] underline"
            onClick={() => {
              flushChainRef.current = flushChainRef.current.then(() => flushPending());
            }}
          >
            {syncError} — повторить
          </button>
        )}
      </div>

      {active ? (
        <Card>
          <button
            type="button"
            onClick={() => setListOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-[var(--control)]/40"
            aria-expanded={listOpen}
          >
            <div>
              <p className="font-display text-lg font-semibold text-[var(--text)]">
                Посещаемость · {formatDateOnly(active.date)}
              </p>
              <p className="mt-0.5 text-sm text-[var(--text-3)]">
                {presentSet.size}/{students.length} присутствуют
                {!listOpen && " · нажмите, чтобы развернуть"}
              </p>
            </div>
            <span
              className={`shrink-0 text-[var(--text-3)] transition-transform ${
                listOpen ? "rotate-180" : ""
              }`}
              aria-hidden
            >
              ▾
            </span>
          </button>
          {listOpen && (
            <CardContent className="space-y-2 border-t border-[var(--border-soft)] pt-4">
              {students.map((st) => {
                const on = presentSet.has(st.id);
                return (
                  <label
                    key={st.id}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5"
                  >
                    <span className="font-medium text-[var(--text)]">{displayName(st)}</span>
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-[var(--points)]"
                        checked={on}
                        onChange={(e) => toggle(st.id, e.target.checked)}
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
          )}
        </Card>
      ) : (
        <p className="text-sm text-[var(--text-3)]">Создайте занятие, чтобы отметить учеников.</p>
      )}
    </div>
  );
}
