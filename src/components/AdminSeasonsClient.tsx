"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SEASON_LABELS, VIBE_LABELS } from "@/lib/labels";
import { displayName, formatDate } from "@/lib/utils";
import { formatPoints } from "@/lib/points";
import { PlayerLink } from "@/components/PlayerLink";
import type {
  RatingSeason,
  User,
  PlayerProfile,
  PeerRating,
  VibeVote,
  PointLog,
  VibeValue,
} from "@prisma/client";

type Season = RatingSeason & {
  peerRatings: (PeerRating & { rater: User; target: User })[];
  vibeVotes?: (VibeVote & { voter: User; target: User })[];
  pointLogs?: PointLog[];
};
type Student = User & { profile: PlayerProfile | null };

type VoteRow = {
  target: Student;
  mechanics?: number;
  macro?: number;
  vibe?: VibeValue;
  complete: boolean;
};

export function AdminSeasonsClient({
  seasons,
  students,
}: {
  seasons: Season[];
  students: Student[];
}) {
  const router = useRouter();
  const [name, setName] = useState<"AUTUMN" | "WINTER" | "SPRING">("AUTUMN");
  const [year, setYear] = useState(new Date().getFullYear());
  const [closesAt, setClosesAt] = useState("");
  const [deadlineInputs, setDeadlineInputs] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, string | null>>({});
  const [reminding, setReminding] = useState(false);

  async function handleCreateSeason() {
    await fetch("/api/ratings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, year, closesAt: closesAt || undefined }),
    });
    setClosesAt("");
    router.refresh();
  }

  async function seasonAction(
    seasonId: string,
    action: "close" | "open" | "activate" | "setDeadline" | "delete",
    deadline?: string
  ) {
    await fetch("/api/ratings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seasonId, action, closesAt: deadline }),
    });
    router.refresh();
  }

  function progress(season: Season) {
    const expected = students.length * Math.max(students.length - 1, 0);
    const skillDone = season.peerRatings.length;
    const vibeDone = season.vibeVotes?.length ?? 0;
    return { skillDone, vibeDone, expected };
  }

  function seasonPointsByUser(season: Season): Record<string, number> {
    const map: Record<string, number> = {};
    for (const log of season.pointLogs ?? []) {
      map[log.userId] = (map[log.userId] ?? 0) + log.delta;
    }
    return map;
  }

  function votesFrom(season: Season, voterId: string): VoteRow[] {
    const vibes = season.vibeVotes ?? [];
    return students
      .filter((s) => s.id !== voterId)
      .map((target) => {
        const skill = season.peerRatings.find(
          (r) => r.raterId === voterId && r.targetId === target.id
        );
        const vibe = vibes.find((v) => v.voterId === voterId && v.targetId === target.id);
        const complete = Boolean(skill && vibe);
        return {
          target,
          mechanics: skill?.mechanics,
          macro: skill?.macro,
          vibe: vibe?.value,
          complete,
        };
      });
  }

  function incompleteVoters(season: Season) {
    return students.filter((s) => votesFrom(season, s.id).some((v) => !v.complete));
  }

  async function remindVote(opts: {
    seasonId: string;
    voterId?: string;
    allIncomplete?: boolean;
  }) {
    setReminding(true);
    try {
      const res = await fetch("/api/ratings/remind-vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(typeof data.error === "string" ? data.error : "Не удалось отправить");
        return;
      }
      const failNote =
        Array.isArray(data.failed) && data.failed.length
          ? `\nБез TG / ошибка: ${data.failed.join(", ")}`
          : "";
      alert(`Отправлено: ${data.sent}. Пропущено: ${data.skipped}.${failNote}`);
    } finally {
      setReminding(false);
    }
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Открыть сезон</CardTitle>
          <p className="text-sm text-[var(--text-3)]">
            Новый сезон становится активным: в него идут очки платформы и голосование. Предыдущие
            сезоны закрываются, текущие очки платформы обнуляются (история сохраняется в логах
            сезонов).
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div>
            <Label>Сезон</Label>
            <select
              className="flex h-11 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]"
              value={name}
              onChange={(e) => setName(e.target.value as typeof name)}
            >
              {Object.entries(SEASON_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Год</Label>
            <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </div>
          <div>
            <Label>Дедлайн голосования (автозакрытие)</Label>
            <Input
              type="datetime-local"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
            />
          </div>
          <Button onClick={handleCreateSeason}>Открыть сезон</Button>
        </CardContent>
      </Card>

      {seasons.map((season) => {
        const { skillDone, vibeDone, expected } = progress(season);
        const pointsMap = seasonPointsByUser(season);
        const seasonTotal = Object.values(pointsMap).reduce((a, b) => a + b, 0);
        const incomplete = incompleteVoters(season);
        const expectedPer = Math.max(students.length - 1, 0);
        const expandKey = expanded[season.id] ?? null;

        return (
          <Card key={season.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>
                  {SEASON_LABELS[season.name]} {season.year}
                </CardTitle>
                {season.isActive && <Badge variant="success">Активный</Badge>}
                <Badge variant={season.status === "OPEN" ? "warning" : "default"}>
                  {season.status === "OPEN" ? "Открыт" : "Закрыт"}
                </Badge>
              </div>
              <p className="text-sm text-[var(--text-3)]">
                Голоса — скилл: {skillDone}/{expected} · вайб: {vibeDone}/{expected}
                {season.closesAt && <> · Дедлайн: {formatDate(season.closesAt)}</>}
                {" · "}
                Очки платформы за сезон: {formatPoints(seasonTotal)}
                {incomplete.length > 0 && (
                  <>
                    {" · "}
                    <span className="text-[var(--danger)]">
                      не доголосовали: {incomplete.length}
                    </span>
                  </>
                )}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {season.status === "OPEN" && incomplete.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={reminding}
                    onClick={() =>
                      remindVote({ seasonId: season.id, allIncomplete: true })
                    }
                  >
                    {reminding ? "Отправка…" : `Напомнить всем недоголосовавшим (${incomplete.length})`}
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                {students.map((student) => {
                  const rows = votesFrom(season, student.id);
                  const done = rows.filter((r) => r.complete).length;
                  const missing = rows.filter((r) => !r.complete);
                  const pts = pointsMap[student.id] ?? 0;
                  const isOpen = expandKey === student.id;

                  return (
                    <div
                      key={student.id}
                      className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--control)]"
                    >
                      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left text-sm text-[var(--text)]"
                          onClick={() =>
                            setExpanded((prev) => ({
                              ...prev,
                              [season.id]: isOpen ? null : student.id,
                            }))
                          }
                        >
                          <PlayerLink user={student} className="inline" />
                          <span className="ml-2 text-[var(--text-3)]">
                            скилл+вайб {done}/{expectedPer}
                          </span>
                          <span className="ml-2 font-mono-num text-[var(--points)]">
                            {formatPoints(pts)} очк.
                          </span>
                          {missing.length > 0 ? (
                            <span className="ml-2 text-xs text-[var(--danger)]">
                              осталось {missing.length}
                            </span>
                          ) : (
                            <span className="ml-2 text-xs text-[var(--success)]">готово</span>
                          )}
                          <span className="ml-2 text-xs text-[var(--text-4)]">
                            {isOpen ? "▾" : "▸"} детали
                          </span>
                        </button>
                        {season.status === "OPEN" && missing.length > 0 && (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={reminding || !student.telegramChatId}
                            title={
                              student.telegramChatId
                                ? undefined
                                : "Нет привязанного Telegram"
                            }
                            onClick={() =>
                              remindVote({ seasonId: season.id, voterId: student.id })
                            }
                          >
                            Напомнить в TG
                          </Button>
                        )}
                      </div>

                      {isOpen && (
                        <div className="border-t border-[var(--border)] px-3 py-2">
                          <p className="mb-2 text-xs uppercase tracking-wide text-[var(--text-4)]">
                            Кого оценил {displayName(student)}
                          </p>
                          <ul className="space-y-1.5 text-sm">
                            {rows.map((row) => (
                              <li
                                key={row.target.id}
                                className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
                              >
                                <PlayerLink user={row.target} className="inline" />
                                {row.complete ? (
                                  <span className="text-[var(--text-2)]">
                                    мех {row.mechanics}/10 · макро {row.macro}/10 · вайб{" "}
                                    {row.vibe ? VIBE_LABELS[row.vibe] : "—"}
                                  </span>
                                ) : (
                                  <span className="text-[var(--danger)]">
                                    не голосовал
                                    {row.mechanics != null || row.macro != null
                                      ? ` (скилл: ${row.mechanics ?? "—"}/${row.macro ?? "—"})`
                                      : ""}
                                    {row.vibe
                                      ? ` · вайб: ${VIBE_LABELS[row.vibe]}`
                                      : row.mechanics == null && row.macro == null
                                        ? ""
                                        : " · вайб нет"}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-end gap-2 pt-2">
                {season.status === "OPEN" && (
                  <>
                    <Input
                      type="datetime-local"
                      className="max-w-xs"
                      value={deadlineInputs[season.id] ?? ""}
                      onChange={(e) =>
                        setDeadlineInputs((prev) => ({ ...prev, [season.id]: e.target.value }))
                      }
                    />
                    <Button
                      variant="secondary"
                      onClick={() =>
                        seasonAction(season.id, "setDeadline", deadlineInputs[season.id])
                      }
                    >
                      Установить дедлайн
                    </Button>
                  </>
                )}
                {!season.isActive && season.status === "OPEN" && (
                  <Button variant="secondary" onClick={() => seasonAction(season.id, "activate")}>
                    Сделать активным
                  </Button>
                )}
                {season.status === "OPEN" ? (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (
                        confirm(
                          "Закрыть сезон? Очки платформы у всех сбросятся до 0. История начислений сохранится."
                        )
                      ) {
                        seasonAction(season.id, "close");
                      }
                    }}
                  >
                    Закрыть сезон (сброс очков)
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => seasonAction(season.id, "open")}>
                    Открыть снова (без сброса)
                  </Button>
                )}
                <Button
                  variant="destructive"
                  onClick={() => {
                    const label = `${SEASON_LABELS[season.name]} ${season.year}`;
                    if (
                      confirm(
                        `Удалить сезон «${label}»?\n\nГолоса скилла и вайба за этот сезон будут стёрты. Записи очков платформы останутся, но без привязки к сезону.`
                      )
                    ) {
                      seasonAction(season.id, "delete");
                    }
                  }}
                >
                  Удалить сезон
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
