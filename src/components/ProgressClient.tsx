"use client";

import { toast } from "@/components/ui/toast";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MetricTile } from "@/components/WeeklyPointsChart";
import { ProgressBarsChart } from "@/components/ProgressBarsChart";
import { Segmented } from "@/components/ui/segmented";
import { Minus, Plus } from "lucide-react";
import { APP_TIMEZONE } from "@/lib/utils";
import { formatShortDate } from "@/lib/format";

type Range = "day" | "week" | "month" | "halfyear";

type Log = {
  id: string;
  date: string;
  gamesPlayed: number;
  replaysWatched: number;
  replayNotes: string;
  takeaways: string;
};

const RANGE_LABELS: Record<Range, string> = {
  day: "День",
  week: "Неделя",
  month: "Месяц",
  halfyear: "Полгода",
};

function moscowToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shortLabel(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: APP_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
  }).format(d);
}

/** Счётчик с кнопками − / + (на телефоне удобнее, чем вводить число с клавиатуры) */
function Stepper({
  id,
  value,
  onChange,
  max = 100,
}: {
  id: string;
  value: number;
  onChange: (v: number) => void;
  max?: number;
}) {
  const set = (v: number) => onChange(Math.max(0, Math.min(max, v)));
  const btn =
    "press flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--control)] disabled:opacity-40";
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={btn} onClick={() => set(value - 1)} disabled={value <= 0} aria-label="Меньше">
        <Minus className="h-4 w-4" aria-hidden />
      </button>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        value={value}
        onChange={(e) => set(Number(e.target.value) || 0)}
        className="w-20 text-center font-mono-num text-[16px]"
      />
      <button type="button" className={btn} onClick={() => set(value + 1)} disabled={value >= max} aria-label="Больше">
        <Plus className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

export function ProgressClient({
  userId,
  readOnly = false,
  compact = false,
}: {
  userId?: string;
  readOnly?: boolean;
  compact?: boolean;
}) {
  const [range, setRange] = useState<Range>("week");
  const [dayKey, setDayKey] = useState(moscowToday());
  const [logs, setLogs] = useState<Log[]>([]);
  const [current, setCurrent] = useState({ games: 0, replays: 0, days: 0 });
  const [previous, setPrevious] = useState({ games: 0, replays: 0, days: 0 });
  const [gamesPlayed, setGamesPlayed] = useState(0);
  const [replaysWatched, setReplaysWatched] = useState(0);
  const [replayNotes, setReplayNotes] = useState("");
  const [takeaways, setTakeaways] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ range, date: dayKey });
      if (userId) q.set("userId", userId);
      const res = await fetch(`/api/progress?${q}`);
      const data = await res.json();
      setLogs(data.logs || []);
      setCurrent(data.current || { games: 0, replays: 0, days: 0 });
      setPrevious(data.previous || { games: 0, replays: 0, days: 0 });
      const t = data.today;
      if (t) {
        setGamesPlayed(t.gamesPlayed ?? 0);
        setReplaysWatched(t.replaysWatched ?? 0);
        setReplayNotes(t.replayNotes ?? "");
        setTakeaways(t.takeaways ?? "");
      } else if (!readOnly) {
        setGamesPlayed(0);
        setReplaysWatched(0);
        setReplayNotes("");
        setTakeaways("");
      }
    } finally {
      setLoading(false);
    }
  }, [range, dayKey, userId, readOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartPoints = useMemo(
    () =>
      logs.map((l) => ({
        label: shortLabel(l.date),
        games: l.gamesPlayed,
        replays: l.replaysWatched,
      })),
    [logs]
  );

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/progress", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: dayKey,
          gamesPlayed,
          replaysWatched,
          replayNotes,
          takeaways,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Не удалось сохранить");
        return;
      }
      toast.success("День сохранён");
      await load();
    } finally {
      setSaving(false);
    }
  }

  const gamesDelta = current.games - previous.games;
  const replaysDelta = current.replays - previous.replays;

  return (
    <div className="space-y-6">
      {/* Период — тот же переключатель-вкладки, что на остальных страницах (а не ряд кнопок) */}
      <Segmented
        value={range}
        onChange={setRange}
        items={(Object.keys(RANGE_LABELS) as Range[]).map((r) => ({ value: r, label: RANGE_LABELS[r] }))}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricTile label="Игр за период" value={current.games} />
        <MetricTile label="Реплеев за период" value={current.replays} />
        <MetricTile
          label="Игры vs прошлый"
          value={`${gamesDelta > 0 ? "+" : ""}${gamesDelta}`}
          hint={`было ${previous.games}`}
        />
        <MetricTile
          label="Реплеи vs прошлый"
          value={`${replaysDelta > 0 ? "+" : ""}${replaysDelta}`}
          hint={`было ${previous.replays}`}
        />
      </div>

      {!loading && <ProgressBarsChart points={chartPoints} title={`За ${RANGE_LABELS[range].toLowerCase()}`} />}

      {!compact && !readOnly && (
        // Одна карточка «за день» и одна кнопка сохранения (раньше было две карточки и две одинаковые кнопки)
        <Card>
          <CardHeader>
            <CardTitle>Мой день</CardTitle>
            <p className="text-sm text-[var(--text-3)]">Без баллов — просто дневник: тренер видит его в профиле.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-w-[220px]">
              <Label htmlFor="progress-date">Дата</Label>
              <Input id="progress-date" type="date" value={dayKey} onChange={(e) => setDayKey(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-4">
              <div>
                <Label htmlFor="progress-games">Игр сыграно</Label>
                <Stepper id="progress-games" value={gamesPlayed} onChange={setGamesPlayed} />
              </div>
              <div>
                <Label htmlFor="progress-replays">Реплеев посмотрено</Label>
                <Stepper id="progress-replays" value={replaysWatched} onChange={setReplaysWatched} />
              </div>
            </div>
            <div>
              <Label htmlFor="progress-notes">Какие реплеи</Label>
              <Textarea
                id="progress-notes"
                value={replayNotes}
                onChange={(e) => setReplayNotes(e.target.value)}
                placeholder="Герои, позиции, тайминги…"
                rows={2}
              />
            </div>
            <div>
              <Label htmlFor="progress-takeaways">Выводы / что нового</Label>
              <Textarea
                id="progress-takeaways"
                value={takeaways}
                onChange={(e) => setTakeaways(e.target.value)}
                placeholder="Что подметили, что будете делать иначе"
                rows={3}
              />
            </div>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Сохранение…" : "Сохранить день"}
            </Button>
          </CardContent>
        </Card>
      )}

      {!compact && logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Записи периода</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[...logs].reverse().map((l) => (
              <div
                key={l.id}
                className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm"
              >
                <p className="font-medium text-[var(--text)]">
                  {formatShortDate(l.date)} · игр {l.gamesPlayed} · реплеев{" "}
                  {l.replaysWatched}
                </p>
                {l.replayNotes && (
                  <p className="mt-1 text-[var(--text-2)]">Реплеи: {l.replayNotes}</p>
                )}
                {l.takeaways && (
                  <p className="mt-1 text-[var(--text-2)]">Выводы: {l.takeaways}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
