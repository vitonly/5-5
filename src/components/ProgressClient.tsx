"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MetricTile } from "@/components/WeeklyPointsChart";
import { ProgressBarsChart } from "@/components/ProgressBarsChart";
import { APP_TIMEZONE, formatDate } from "@/lib/utils";

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
        alert(data.error || "Не удалось сохранить");
        return;
      }
      await load();
    } finally {
      setSaving(false);
    }
  }

  const gamesDelta = current.games - previous.games;
  const replaysDelta = current.replays - previous.replays;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
          <Button
            key={r}
            size="sm"
            variant={range === r ? "default" : "outline"}
            onClick={() => setRange(r)}
          >
            {RANGE_LABELS[r]}
          </Button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        <div className="space-y-4">
          <div>
            <Label>Дата</Label>
            <Input type="date" value={dayKey} onChange={(e) => setDayKey(e.target.value)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Игр сыграно</CardTitle>
              <p className="text-sm text-[var(--text-3)]">Просто счётчик за день.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Количество</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={gamesPlayed}
                  onChange={(e) => setGamesPlayed(Number(e.target.value) || 0)}
                />
              </div>
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? "Сохранение…" : "Сохранить игры"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Реплеев посмотрено</CardTitle>
              <p className="text-sm text-[var(--text-3)]">Без баллов — учёт просмотров и выводов.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Количество</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={replaysWatched}
                  onChange={(e) => setReplaysWatched(Number(e.target.value) || 0)}
                />
              </div>
              <div>
                <Label>Какие реплеи</Label>
                <Textarea
                  value={replayNotes}
                  onChange={(e) => setReplayNotes(e.target.value)}
                  placeholder="Герои, позиции, тайминги…"
                  rows={2}
                />
              </div>
              <div>
                <Label>Выводы / что нового</Label>
                <Textarea
                  value={takeaways}
                  onChange={(e) => setTakeaways(e.target.value)}
                  placeholder="Что подметили, что будете делать иначе"
                  rows={3}
                />
              </div>
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? "Сохранение…" : "Сохранить реплеи"}
              </Button>
            </CardContent>
          </Card>
        </div>
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
                  {formatDate(l.date).replace(/ в .+$/, "")} · игр {l.gamesPlayed} · реплеев{" "}
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
