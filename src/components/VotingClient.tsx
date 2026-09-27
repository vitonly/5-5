"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SEASON_LABELS, RATING_CRITERIA_HINTS, VIBE_LABELS } from "@/lib/labels";
import { displayName } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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

  if (!openSeason) {
    return (
      <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
        <p className="text-[var(--text-2)]">
          Сейчас голосование закрыто. Оно откроется в начале сезона — тренер сообщит.
        </p>
      </div>
    );
  }

  if (!active) {
    return <p className="text-[var(--text-2)]">Нет игроков для оценки.</p>;
  }

  const currentScore = getScore(active.id) ?? 50;

  return (
    <div className="space-y-4">
      <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="font-display text-lg font-semibold">
            {SEASON_LABELS[openSeason.name]} {openSeason.year}
          </p>
          <div className="flex items-center gap-3">
            <span
              className={`font-mono-num text-[12px] font-medium ${
                saveStatus === "saved"
                  ? "text-[var(--success)]"
                  : saveStatus === "err"
                    ? "text-[var(--danger)]"
                    : "text-[var(--text-4)]"
              }`}
            >
              {saveStatus === "saving" && "сохранение…"}
              {saveStatus === "saved" && "сохранено"}
              {saveStatus === "err" && "не сохранилось — повторите"}
              {saveStatus === "idle" && "галочка = сохранено на сервере"}
            </span>
            <span className="rounded-full border border-[var(--border)] bg-[var(--control)] px-2.5 py-1 font-mono-num text-[12px] font-bold text-[var(--text-2)]">
              {doneCount} / {total}
            </span>
          </div>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-[var(--control)]">
          <div
            className="h-full rounded-full bg-[var(--points)] transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-[12px] text-[var(--text-4)]">
          Оценка 0–100 и тильт. Голос тренера и учеников вес 50/50. Галочка — после сохранения.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="mb-2 font-mono-num text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-4)]">
            Очередь
          </p>
          <ul className="flex gap-1.5 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
            {others.map((s, i) => {
              const done = isComplete(s.id);
              const isActive = i === activeIndex;
              const partial = !done && (getScore(s.id) != null || getVibe(s.id) != null);
              return (
                <li key={s.id} className="shrink-0 lg:w-full">
                  <button
                    type="button"
                    onClick={() => setActiveIndex(i)}
                    className={`flex min-h-[46px] w-full items-center gap-2 rounded-[var(--radius-control)] px-2.5 py-2 text-left text-sm transition-colors lg:min-h-0 ${
                      isActive
                        ? "bg-[var(--points-bg)] text-[var(--points)]"
                        : "text-[var(--text-2)] hover:bg-[var(--control)]"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                        done
                          ? "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)]"
                          : partial
                            ? "border-[var(--points-border)] bg-[var(--points-bg)] text-[var(--points)]"
                            : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-4)]"
                      }`}
                    >
                      {done ? "✓" : partial ? "…" : i + 1}
                    </span>
                    <span className="max-w-[7rem] truncate font-medium lg:max-w-none">
                      {displayName(s)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-4 border-b border-[var(--border-soft)] pb-4">
            <div className="h-14 w-14 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--control)]">
              {active.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={active.photoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="img-placeholder h-full w-full" />
              )}
            </div>
            <div>
              <h2 className="font-display text-2xl font-bold">{displayName(active)}</h2>
              <p className="text-[13px] text-[var(--text-3)]">
                Игрок {activeIndex + 1} из {total}
                {isComplete(active.id) ? (
                  <span className="ml-2 text-[var(--success)]">· сохранено</span>
                ) : (
                  <span className="ml-2 text-[var(--danger)]">· не полностью</span>
                )}
              </p>
            </div>
          </div>

          <div className="border-t border-[var(--border-soft)] py-4 first:border-t-0 first:pt-0">
            <p className="text-[15px] font-semibold text-[var(--text)]">Оценка силы (0–100)</p>
            <p className="mb-3 text-[13px] text-[var(--text-3)]">{RATING_CRITERIA_HINTS.score}</p>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={0}
                max={100}
                value={currentScore}
                onChange={(e) => setScore(active.id, Number(e.target.value))}
                className="h-2 w-full accent-[var(--points)]"
              />
              <input
                type="number"
                min={0}
                max={100}
                value={currentScore}
                onChange={(e) => {
                  const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                  setScore(active.id, v);
                }}
                className="w-16 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--control)] px-2 py-2 text-center font-mono-num text-sm font-bold"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {[0, 25, 50, 75, 100].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setScore(active.id, v)}
                  className={`rounded-[var(--radius-control)] border px-3 py-1.5 font-mono-num text-xs font-bold ${
                    currentScore === v
                      ? "border-[var(--points)] bg-[var(--points)] text-white"
                      : "border-[var(--border)] bg-[var(--control)] text-[var(--text-2)]"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-[var(--border-soft)] py-4">
            <p className="text-[15px] font-semibold text-[var(--text)]">Тильт</p>
            <p className="mb-3 text-[13px] text-[var(--text-3)]">
              Подвержен ли игрок тильту в играх
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {TILT_OPTIONS.map((opt) => {
                const sel = getVibe(active.id) === opt;
                const selectedClass =
                  opt === "STABLE"
                    ? "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)]"
                    : opt === "UNSURE"
                      ? "border-[var(--border)] bg-[var(--control)] text-[var(--text-2)]"
                      : "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)]";
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setVibe(active.id, opt)}
                    className={`min-h-[46px] rounded-[var(--radius-control)] border px-2 text-sm font-semibold transition-colors ${
                      sel
                        ? selectedClass
                        : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:bg-[var(--control)]"
                    }`}
                  >
                    {VIBE_LABELS[opt]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-10 -mx-5 mt-2 border-t border-[var(--border-soft)] bg-[var(--surface)] px-5 py-3 min-[720px]:static min-[720px]:mx-0 min-[720px]:flex min-[720px]:justify-end min-[720px]:px-0 min-[720px]:pt-4">
            <Button
              onClick={goNext}
              disabled={activeIndex >= others.length - 1 || !isComplete(active.id)}
              className="h-[46px] w-full min-[720px]:h-11 min-[720px]:w-auto"
            >
              {isComplete(active.id) ? "Следующий игрок" : "Сначала сохраните все оценки"}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
