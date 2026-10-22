"use client";

import { toast } from "@/components/ui/toast";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  soloGames: number;
  partyGames: number;
  replaysWatched: number;
  replayNotes: string;
  takeaways: string;
};

type DotaMeta = {
  steamAccountId: number | null;
  private: boolean;
  syncedAt: string | null;
  noSteam: boolean;
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

/** Счётчик с кнопками − / + (для реплеев) */
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
  const [current, setCurrent] = useState({ games: 0, solo: 0, party: 0, replays: 0, days: 0 });
  const [previous, setPrevious] = useState({ games: 0, solo: 0, party: 0, replays: 0, days: 0 });
  const [soloGames, setSoloGames] = useState(0);
  const [partyGames, setPartyGames] = useState(0);
  const [replaysWatched, setReplaysWatched] = useState(0);
  const [replayNotes, setReplayNotes] = useState("");
  const [takeaways, setTakeaways] = useState("");
  const [dota, setDota] = useState<DotaMeta | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ range, date: dayKey });
      if (userId) q.set("userId", userId);
      // Sync OpenDota for own editable diary (throttled на сервере)
      if (!readOnly) q.set("sync", "1");
      const res = await fetch(`/api/progress?${q}`);
      const data = await res.json();
      setLogs(data.logs || []);
      setCurrent(data.current || { games: 0, solo: 0, party: 0, replays: 0, days: 0 });
      setPrevious(data.previous || { games: 0, solo: 0, party: 0, replays: 0, days: 0 });
      setDota(data.dota ?? null);
      const t = data.today;
      if (t) {
        setSoloGames(t.soloGames ?? 0);
        setPartyGames(t.partyGames ?? 0);
        setReplaysWatched(t.replaysWatched ?? 0);
        setReplayNotes(t.replayNotes ?? "");
        setTakeaways(t.takeaways ?? "");
      } else if (!readOnly) {
        setSoloGames(0);
        setPartyGames(0);
        setReplaysWatched(0);
        setReplayNotes("");
        setTakeaways("");
      }
    } finally {
      setLoading(false);
    }
  }, [range, dayKey, userId, readOnly]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- загрузка дневника при открытии и смене периода — законное место для эффекта
    void load();
  }, [load]);

  const chartPoints = useMemo(
    () =>
      logs.map((l) => ({
        label: shortLabel(l.date),
        solo: l.soloGames ?? 0,
        party: l.partyGames ?? 0,
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
  const todayRanked = soloGames + partyGames;
  const showBanner = !readOnly && dota && (dota.noSteam || dota.private);

  return (
    <div className="space-y-6">
      <Segmented
        value={range}
        onChange={setRange}
        items={(Object.keys(RANGE_LABELS) as Range[]).map((r) => ({ value: r, label: RANGE_LABELS[r] }))}
      />

      {showBanner && (
        <div
          role="status"
          className="rounded-[var(--radius-card)] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger-ink)]"
        >
          {dota?.noSteam ? (
            <>
              <p className="font-semibold">Привяжите аккаунт Dota</p>
              <p className="mt-1 text-[var(--text-2)]">
                Игры подтягиваются из OpenDota по Steam ID. Укажите ссылку на профиль в{" "}
                <Link href="/profile?tab=settings" className="font-medium text-[var(--points)] underline">
                  настройках профиля
                </Link>
                .
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold">История матчей скрыта — игры не видны</p>
              <p className="mt-1 text-[var(--text-2)]">
                Откройте профиль в Steam, иначе OpenDota и Dotabuff не видят рейтинговые игры:
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-[var(--text-2)]">
                <li>
                  Steam → <b>Профиль</b> → <b>Редактировать профиль</b> → <b>Конфиденциальность</b>
                </li>
                <li>
                  «Сведения об игре» / Game details → <b>Открытый</b> (Public)
                </li>
                <li>
                  Подождите несколько минут и обновите эту страницу — синк подтянет рейтинговые матчи
                  с 1-го числа месяца
                </li>
              </ol>
              {dota?.steamAccountId ? (
                <p className="mt-2">
                  <a
                    href={`https://www.opendota.com/players/${dota.steamAccountId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-[var(--points)] underline"
                  >
                    Проверить на OpenDota
                  </a>
                  {" · "}
                  <a
                    href={`https://www.dotabuff.com/players/${dota.steamAccountId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-[var(--points)] underline"
                  >
                    Dotabuff
                  </a>
                </p>
              ) : null}
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricTile label="Рейтинг за период" value={current.games} hint={`соло ${current.solo} · пати ${current.party}`} />
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
        <Card>
          <CardHeader>
            <CardTitle>Мой день</CardTitle>
            <p className="text-sm text-[var(--text-3)]">
              Рейтинговые игры подтягиваются из OpenDota. Реплеи и выводы пишете сами.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-w-[220px]">
              <Label htmlFor="progress-date">Дата</Label>
              <Input id="progress-date" type="date" value={dayKey} onChange={(e) => setDayKey(e.target.value)} />
            </div>
            <div className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3">
              <p className="text-[12px] font-medium uppercase tracking-wide text-[var(--text-3)]">
                Рейтинг за день (авто)
              </p>
              <p className="mt-1 font-mono-num text-[22px] font-bold text-[var(--text)]">
                {todayRanked}
                <span className="ml-2 text-[14px] font-medium text-[var(--text-3)]">
                  соло {soloGames} · пати {partyGames}
                </span>
              </p>
            </div>
            <div>
              <Label htmlFor="progress-replays">Реплеев посмотрено</Label>
              <Stepper id="progress-replays" value={replaysWatched} onChange={setReplaysWatched} />
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
            {[...logs].reverse().slice(0, 10).map((l) => (
              <div
                key={l.id}
                className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm"
              >
                <p className="font-medium text-[var(--text)]">
                  {formatShortDate(l.date)} · рейтинг {l.gamesPlayed} (соло {l.soloGames ?? 0} / пати{" "}
                  {l.partyGames ?? 0}) · реплеев {l.replaysWatched}
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
