"use client";

import { Avatar } from "@/components/home/Avatar";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { fireConfetti } from "@/lib/confetti";
import { useRouter } from "next/navigation";
import { SEASON_LABELS, RATING_CRITERIA_HINTS, VIBE_LABELS } from "@/lib/labels";
import { cn, displayName } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Flame,
  Loader2,
  Lock,
  ShieldCheck,
} from "lucide-react";
import type { RatingSeason, User, PlayerProfile, PeerRating, VibeVote, VibeValue } from "@prisma/client";

type Student = User & { profile: PlayerProfile | null };
type SeasonWithRatings = RatingSeason & {
  peerRatings: (PeerRating & { rater: User; target: User })[];
  vibeVotes?: (VibeVote & { voter: User; target: User })[];
};

const TILT_OPTIONS: VibeValue[] = ["STABLE", "UNSURE", "TILT"];

type Draft = { score?: number; vibe?: VibeValue };

export function VotingClient({
  openSeason,
  students,
  currentUserId,
}: {
  openSeason: SeasonWithRatings | null | undefined;
  students: Student[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "err">("idle");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const [savedScore, setSavedScore] = useState<Record<string, number>>({});
  const [savedVibe, setSavedVibe] = useState<Record<string, VibeValue>>({});
  const [activeIndex, setActiveIndex] = useState(0);

  const others = useMemo(
    () => students.filter((s) => s.id !== currentUserId),
    [students, currentUserId]
  );
  const vibeVotes = openSeason?.vibeVotes ?? [];

  function dbScore(targetId: string): number | undefined {
    if (savedScore[targetId] != null) return savedScore[targetId];
    const row = openSeason?.peerRatings.find(
      (r) => r.raterId === currentUserId && r.targetId === targetId
    );
    return row?.score;
  }

  function dbVibe(targetId: string): VibeValue | undefined {
    return (
      savedVibe[targetId] ??
      vibeVotes.find((v) => v.voterId === currentUserId && v.targetId === targetId)?.value
    );
  }

  function getScore(targetId: string): number | undefined {
    return drafts[targetId]?.score ?? dbScore(targetId);
  }

  function getVibe(targetId: string): VibeValue | undefined {
    return drafts[targetId]?.vibe ?? dbVibe(targetId);
  }

  function isComplete(targetId: string) {
    return dbScore(targetId) != null && dbVibe(targetId) != null;
  }

  const doneCount = others.filter((s) => isComplete(s.id)).length;
  const total = others.length;
  const pct = total ? (doneCount / total) * 100 : 0;

  // Праздник, когда ученик оценил последнего тиммейта
  const prevDone = useRef(doneCount);
  useEffect(() => {
    if (total > 0 && doneCount === total && prevDone.current < total) {
      fireConfetti({ count: 110 });
      toast.success("Все оценки сохранены — спасибо!");
    }
    prevDone.current = doneCount;
  }, [doneCount, total]);
  const active = others[Math.min(activeIndex, Math.max(others.length - 1, 0))];

  async function saveScore(targetId: string, score: number) {
    if (!openSeason) return;
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/ratings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonId: openSeason.id, targetId, score }),
      });
      if (!res.ok) throw new Error("fail");
      setSavedScore((s) => ({ ...s, [targetId]: score }));
      setSaveStatus("saved");
      startTransition(() => router.refresh());
    } catch {
      setSaveStatus("err");
      toast.error("Оценка не сохранилась — попробуйте ещё раз");
      setDrafts((d) => {
        const next = { ...d };
        if (next[targetId]) {
          const { score: _s, ...rest } = next[targetId];
          next[targetId] = rest;
        }
        draftsRef.current = next;
        return next;
      });
    }
  }

  async function saveVibe(targetId: string, vibe: VibeValue) {
    if (!openSeason) return;
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/ratings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonId: openSeason.id, targetId, vibe }),
      });
      if (!res.ok) throw new Error("fail");
      setSavedVibe((s) => ({ ...s, [targetId]: vibe }));
      setSaveStatus("saved");
      startTransition(() => router.refresh());
    } catch {
      setSaveStatus("err");
      toast.error("Ответ про тильт не сохранился — попробуйте ещё раз");
      setDrafts((d) => {
        const next = { ...d };
        if (next[targetId]) {
          const { vibe: _v, ...rest } = next[targetId];
          next[targetId] = rest;
        }
        draftsRef.current = next;
        return next;
      });
    }
  }

  function setScore(targetId: string, score: number) {
    const prev = draftsRef.current[targetId] ?? {};
    const nextDrafts = { ...draftsRef.current, [targetId]: { ...prev, score } };
    draftsRef.current = nextDrafts;
    setDrafts(nextDrafts);
    void saveScore(targetId, score);
  }

  function setVibe(targetId: string, vibe: VibeValue) {
    const prev = draftsRef.current[targetId] ?? {};
    const nextDrafts = { ...draftsRef.current, [targetId]: { ...prev, vibe } };
    draftsRef.current = nextDrafts;
    setDrafts(nextDrafts);
    void saveVibe(targetId, vibe);
  }

  function goNext() {
    if (activeIndex < others.length - 1) setActiveIndex((i) => i + 1);
  }

  function goPrev() {
    if (activeIndex > 0) setActiveIndex((i) => i - 1);
  }

  if (!openSeason) {
    return (
      <div className="surface-card flex flex-col items-center px-6 py-12 text-center">
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--control)] text-[var(--text-3)]">
          <Lock className="h-6 w-6" aria-hidden />
        </span>
        <p className="font-medium text-[var(--text)]">Голосование закрыто</p>
        <p className="mt-1 max-w-[42ch] text-sm text-[var(--text-3)]">
          Оно откроется в начале сезона — тренер сообщит в Telegram.
        </p>
      </div>
    );
  }

  if (!active) {
    return <p className="surface-card px-4 py-10 text-center text-sm text-[var(--text-3)]">Нет игроков для оценки.</p>;
  }

  const currentScore = getScore(active.id) ?? 50;
  const activeDone = isComplete(active.id);
  const allDone = total > 0 && doneCount === total;
  const scoreColor =
    currentScore >= 75 ? "var(--success-ink)" : currentScore >= 40 ? "var(--points-ink)" : "var(--warning-ink)";

  return (
    <div className="space-y-4">
      {/* Прогресс */}
      <div className="surface-card px-4 py-3.5 min-[720px]:px-5">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow">
              {SEASON_LABELS[openSeason.name]} {openSeason.year}
            </p>
            <p className="mt-0.5 text-[15px] font-semibold text-[var(--text)]">
              {allDone ? "Готово — вы оценили всех" : "Оцените тиммейтов"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <SaveIndicator status={saveStatus} />
            <span className="font-mono-num text-[15px] font-bold text-[var(--text)]">
              {doneCount}
              <span className="text-[var(--text-3)]">/{total}</span>
            </span>
          </div>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--control)]">
          <div
            className="progress-fill h-full w-full origin-left rounded-full transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]"
            style={{
              transform: `scaleX(${Math.max(0, Math.min(1, pct / 100))})`,
              background: allDone ? "var(--success)" : "var(--points)",
            }}
          />
        </div>
        <p className="mt-2 text-[12px] text-[var(--text-3)]">
          Оценка 0–100 и тильт. Голос тренера и учеников — 50/50. Всё сохраняется сразу.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Очередь */}
        <aside className="surface-card min-w-0 p-2.5 lg:p-3">
          <p className="eyebrow mb-2 hidden px-1 lg:block">Очередь</p>
          <ul className="no-scrollbar flex gap-2 overflow-x-auto lg:block lg:space-y-0.5 lg:overflow-visible">
            {others.map((s, i) => {
              const done = isComplete(s.id);
              const isActive = i === activeIndex;
              const partial = !done && (getScore(s.id) != null || getVibe(s.id) != null);
              return (
                <li key={s.id} className="shrink-0 lg:w-full">
                  <button
                    type="button"
                    onClick={() => setActiveIndex(i)}
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "press flex w-[68px] flex-col items-center gap-1 rounded-[var(--radius-control)] px-1 py-1.5 text-center transition-colors lg:w-full lg:flex-row lg:gap-2.5 lg:px-2 lg:py-1.5 lg:text-left",
                      isActive ? "bg-[var(--points-bg)]" : "hover:bg-[var(--control)]"
                    )}
                  >
                    <span className="relative">
                      <Avatar
                        photoUrl={s.photoUrl}
                        firstName={s.firstName}
                        lastName={s.lastName}
                        size={40}
                        className={cn(
                          "lg:!h-8 lg:!w-8",
                          isActive && "ring-2 ring-[var(--points)]",
                          done && !isActive && "opacity-60"
                        )}
                      />
                      {(done || partial) && (
                        <span
                          className={cn(
                            "absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-[var(--surface)] text-white",
                            done ? "bg-[var(--success)]" : "bg-[var(--warning)]"
                          )}
                          aria-label={done ? "сохранено" : "не до конца"}
                        >
                          {done ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : <span className="h-1 w-1 rounded-full bg-white" />}
                        </span>
                      )}
                    </span>
                    <span
                      className={cn(
                        "w-full truncate text-[11px] font-medium lg:flex-1 lg:text-[14px]",
                        isActive ? "text-[var(--points-ink)]" : "text-[var(--text-2)]"
                      )}
                    >
                      {displayName(s)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Карточка игрока */}
        <section className="surface-card min-w-0 p-4 min-[720px]:p-6">
          <div className="flex items-center gap-4">
            <Avatar
              photoUrl={active.photoUrl}
              firstName={active.firstName}
              lastName={active.lastName}
              size={64}
              className="ring-2 ring-[var(--border)]"
            />
            <div className="min-w-0">
              <p className="text-[12px] text-[var(--text-3)]">
                Игрок {activeIndex + 1} из {total}
              </p>
              <h2 className="truncate font-display text-[22px] font-bold leading-tight min-[720px]:text-[26px]">
                {displayName(active)}
              </h2>
              <Badge variant={activeDone ? "success" : "warning"} className="mt-1.5">
                {activeDone ? "Сохранено" : "Нужны обе оценки"}
              </Badge>
            </div>
          </div>

          <div className="mt-6 border-t border-[var(--border-soft)] pt-5">
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-[var(--text)]">Сила игрока</p>
                <p className="mt-0.5 text-[13px] text-[var(--text-3)]">{RATING_CRITERIA_HINTS.score}</p>
              </div>
              <label className="shrink-0 text-right">
                <span className="sr-only">Оценка числом</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  value={currentScore}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                    setScore(active.id, v);
                  }}
                  className="input-display appearance-none [-moz-appearance:textfield] w-[96px] rounded-[var(--radius-control)] border border-transparent bg-transparent text-right font-display text-[40px] font-bold leading-none outline-none transition-colors hover:border-[var(--border)] focus:border-[var(--points)]"
                  style={{ color: scoreColor }}
                />
              </label>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={currentScore}
              onChange={(e) => setScore(active.id, Number(e.target.value))}
              aria-label="Оценка силы"
              className="range-points mt-4 w-full"
              style={{ "--val": `${currentScore}%` } as React.CSSProperties}
            />
            <div className="mt-3 grid grid-cols-5 gap-1 rounded-[var(--radius-control)] bg-[var(--control)] p-1">
              {[0, 25, 50, 75, 100].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setScore(active.id, v)}
                  className={cn(
                    "press h-9 rounded-[var(--radius-sm)] font-mono-num text-[13px] font-bold transition-colors",
                    currentScore === v
                      ? "bg-[var(--surface)] text-[var(--points-ink)] shadow-[var(--shadow-xs)]"
                      : "text-[var(--text-2)] hover:text-[var(--text)]"
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 border-t border-[var(--border-soft)] pt-5">
            <p className="text-[15px] font-semibold text-[var(--text)]">Тильт</p>
            <p className="mb-3 mt-0.5 text-[13px] text-[var(--text-3)]">Подвержен ли игрок тильту в играх</p>
            <div className="grid grid-cols-1 gap-2 min-[560px]:grid-cols-3">
              {TILT_OPTIONS.map((opt) => {
                const sel = getVibe(active.id) === opt;
                const Icon = TILT_ICON[opt];
                const selectedClass = {
                  STABLE: "border-[var(--success)] bg-[var(--success-bg)] text-[var(--success-ink)]",
                  UNSURE: "border-[var(--border-field)] bg-[var(--control)] text-[var(--text)]",
                  TILT: "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger)]",
                }[opt as "STABLE" | "UNSURE" | "TILT"];
                return (
                  <button
                    key={opt}
                    type="button"
                    aria-pressed={sel}
                    onClick={() => setVibe(active.id, opt)}
                    className={cn(
                      "press flex min-h-[48px] items-center gap-2.5 rounded-[var(--radius-control)] border px-3 text-left text-sm font-semibold transition-colors min-[560px]:flex-col min-[560px]:justify-center min-[560px]:gap-1.5 min-[560px]:py-3 min-[560px]:text-center",
                      sel
                        ? selectedClass
                        : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:bg-[var(--surface-muted)]"
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden />
                    {VIBE_LABELS[opt]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-10 -mx-4 mt-5 flex gap-2 border-t border-[var(--border-soft)] bg-[var(--surface)] px-4 py-3 min-[720px]:static min-[720px]:mx-0 min-[720px]:justify-between min-[720px]:px-0 min-[720px]:pb-0 min-[720px]:pt-5">
            <Button variant="outline" onClick={goPrev} disabled={activeIndex === 0} aria-label="Предыдущий игрок" className="px-3">
              <ChevronLeft aria-hidden />
              <span className="hidden min-[720px]:inline">Назад</span>
            </Button>
            <Button
              onClick={goNext}
              disabled={activeIndex >= others.length - 1 || !activeDone}
              className="flex-1 min-[720px]:flex-none"
            >
              {activeIndex >= others.length - 1
                ? allDone
                  ? "Все оценки сохранены"
                  : "Это последний игрок"
                : activeDone
                  ? "Следующий игрок"
                  : "Сначала обе оценки"}
              {activeIndex < others.length - 1 && activeDone && <ChevronRight aria-hidden />}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

const TILT_ICON = {
  STABLE: ShieldCheck,
  UNSURE: CircleHelp,
  TILT: Flame,
} as Record<string, typeof ShieldCheck>;

function SaveIndicator({ status }: { status: "idle" | "saving" | "saved" | "err" }) {
  if (status === "idle") return null;
  const map = {
    saving: { icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, text: "сохраняю", cls: "text-[var(--text-3)]" },
    saved: { icon: <Check className="h-3.5 w-3.5" />, text: "сохранено", cls: "text-[var(--success-ink)]" },
    err: { icon: <AlertCircle className="h-3.5 w-3.5" />, text: "ошибка", cls: "text-[var(--danger)]" },
  }[status];
  return (
    <span className={cn("inline-flex items-center gap-1 text-[12px] font-medium", map.cls)} aria-live="polite">
      {map.icon}
      <span className="hidden min-[400px]:inline">{map.text}</span>
    </span>
  );
}
