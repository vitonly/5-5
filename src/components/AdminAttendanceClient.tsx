"use client";

import { cn } from "@/lib/utils";

import { toast } from "@/components/ui/toast";
import { confirmAction } from "@/components/ui/confirm";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { displayName, formatDateOnly } from "@/lib/utils";
import { POINT_VALUES, formatPoints } from "@/lib/points";
import { moscowDateKey, moscowWeekday, sortSlots, slotsLabel } from "@/lib/schedule";

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
  /** Занятие группы; null — для всех учеников */
  group: { id: string; name: string } | null;
};

type Group = {
  id: string;
  name: string;
  memberIds: string[];
  schedule: { weekday: number; time: string }[];
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
  const [groups, setGroups] = useState<Group[]>([]);
  const [newGroupId, setNewGroupId] = useState("");   // "" — занятие для всех учеников
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newDate, setNewDate] = useState(nextWednesdayLocal());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);

  /** Local checkbox overrides before/while server sync */
  const [localPresent, setLocalPresent] = useState<Record<string, boolean>>({});
  const pendingRef = useRef<Map<string, boolean>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushChainRef = useRef<Promise<void>>(Promise.resolve());
  // Номер открытого занятия для отложенного сохранения (ref меняем в эффекте, не при отрисовке)
  const activeIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/attendance");
      const data = await res.json();
      setSessions(data.sessions || []);
      setStudents(data.students || []);
      setGroups(data.groups || []);
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

  // Открыли другое занятие — сбрасываем несохранённые отметки и разворачиваем список
  // (состояние — сразу при отрисовке, а очередь и таймер — в эффекте ниже)
  const [shownSessionId, setShownSessionId] = useState(activeId);
  if (activeId !== shownSessionId) {
    setShownSessionId(activeId);
    setLocalPresent({});
    setListOpen(true);
  }

  useEffect(() => {
    pendingRef.current.clear();
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

  // date — «2026-10-21», groupId — группа (пусто — все ученики)
  // Удалить занятие (лишний день): очки за посещение у отмеченных откатываются на сервере
  async function deleteSession(s: Session) {
    const present = s.attendances.filter((a) => a.present).length;
    const title = `${formatDateOnly(s.date)}${s.group ? ` · ${s.group.name}` : ""}`;
    const note = present
      ? `\nОтмечено учеников: ${present} — у них снимется +${formatPoints(POINT_VALUES.LESSON_ATTEND)} за это занятие.`
      : "\nОтметок в нём нет.";
    if (!(await confirmAction(`Удалить занятие «${title}»?${note}`))) return;
    const res = await fetch("/api/attendance", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: s.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Не удалось удалить занятие");
      return;
    }
    // Убираем из списка и открываем соседнее занятие
    const rest = sessions.filter((x) => x.id !== s.id);
    setSessions(rest);
    setActiveId(rest[0]?.id ?? null);
    toast.success(`Занятие «${title}» удалено`);
    router.refresh();
  }

  async function createSession(date = newDate, groupId = newGroupId) {
    const res = await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, groupId: groupId || null }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Ошибка");
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

  // Ученики занятия: у занятия группы — её состав, иначе все
  function rosterOf(s: Session | null): Student[] {
    if (!s?.group) return students;
    const ids = new Set(groups.find((g) => g.id === s.group!.id)?.memberIds ?? []);
    return students.filter((st) => ids.has(st.id));
  }
  const roster = rosterOf(active);
  const rosterIds = new Set(roster.map((st) => st.id));
  const others = students.filter((st) => !rosterIds.has(st.id));

  // Группы, у которых сегодня занятие по расписанию
  const today = moscowWeekday();
  const todayGroups = groups
    .map((g) => ({ g, slots: sortSlots(g.schedule.filter((x) => x.weekday === today)) }))
    .filter((x) => x.slots.length > 0);

  const studentRow = (st: Student) => {
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
          <span className={`font-mono-num text-xs ${on ? "text-[var(--success)]" : "text-[var(--text-3)]"}`}>
            {on ? `+${formatPoints(POINT_VALUES.LESSON_ATTEND)}` : "нет"}
          </span>
        </span>
      </label>
    );
  };

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
        <CardContent className="space-y-4">
          {todayGroups.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-3)]">Сегодня по расписанию</p>
              <div className="flex flex-wrap gap-2">
                {todayGroups.map(({ g, slots }) => (
                  <Button key={g.id} size="sm" variant="secondary" onClick={() => void createSession(moscowDateKey(), g.id)}>
                    {g.name} · {slots.map((x) => x.time).join(", ")}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label>Дата</Label>
              <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            </div>
            <div>
              <Label>Группа</Label>
              <select
                value={newGroupId}
                onChange={(e) => setNewGroupId(e.target.value)}
                className="mt-1 block h-[46px] rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm min-[720px]:h-11"
              >
                <option value="">Все ученики</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                    {g.schedule.length ? ` (${slotsLabel(g.schedule)})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={() => void createSession()}>Создать / открыть</Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {sessions.map((s) => (
          // Выбор занятия — чип-фильтр (как сезоны в «Статистике»), а не ряд основных кнопок
          <button
            key={s.id}
            type="button"
            aria-pressed={s.id === activeId}
            onClick={() => setActiveId(s.id)}
            className={cn(
              "press inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full border px-3.5 font-mono-num text-[13px] font-medium transition-colors",
              s.id === activeId
                ? "border-[var(--points-border)] bg-[var(--points-bg)] text-[var(--points-ink)]"
                : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:bg-[var(--control)]"
            )}
          >
            {formatDateOnly(s.date)}
            {s.group ? ` · ${s.group.name}` : ""} ·{" "}
            {(s.id === activeId
              ? presentSet.size
              : s.attendances.filter((a) => a.present).length)}
            /{rosterOf(s).length}
          </button>
        ))}
        {syncing && (
          <span className="text-xs text-[var(--text-3)]">Сохранение очков…</span>
        )}
        {!syncing && pendingCount > 0 && (
          <span className="text-xs text-[var(--text-3)]">Ожидание…</span>
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
                {active.group ? ` · ${active.group.name}` : ""}
              </p>
              <p className="mt-0.5 text-sm text-[var(--text-3)]">
                {presentSet.size}/{roster.length} присутствуют
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
              {roster.map(studentRow)}
              {active.group && others.length > 0 && (
                <details className="pt-2">
                  <summary className="cursor-pointer text-sm text-[var(--text-3)]">
                    Другие ученики — пришли не со своей группой ({others.length})
                  </summary>
                  <div className="mt-2 space-y-2">{others.map(studentRow)}</div>
                </details>
              )}
              <div className="flex justify-end pt-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => void deleteSession(active)}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                  Удалить это занятие
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      ) : (
        <p className="text-sm text-[var(--text-3)]">Создайте занятие, чтобы отметить учеников.</p>
      )}
    </div>
  );
}
