"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SEASON_LABELS } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import { formatPoints } from "@/lib/points";
import { PlayerLink } from "@/components/PlayerLink";
import type { RatingSeason, User, PlayerProfile, PeerRating, VibeVote, PointLog } from "@prisma/client";

type Season = RatingSeason & {
  peerRatings: (PeerRating & { rater: User; target: User })[];
  vibeVotes?: (VibeVote & { voter: User; target: User })[];
  pointLogs?: PointLog[];
};
type Student = User & { profile: PlayerProfile | null };

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
    action: "close" | "open" | "activate" | "setDeadline",
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
    const expected = students.length * (students.length - 1);
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
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {students.map((student) => {
                const givenSkill = season.peerRatings.filter((r) => r.raterId === student.id).length;
                const givenVibe = (season.vibeVotes ?? []).filter((r) => r.voterId === student.id)
                  .length;
                const expectedPer = students.length - 1;
                const lowSkill = givenSkill < 3 && expectedPer >= 3;
                const pts = pointsMap[student.id] ?? 0;
                return (
                  <p key={student.id} className="text-sm text-[var(--text)]">
                    <PlayerLink user={student} className="inline" />: скилл {givenSkill}/
                    {expectedPer}, вайб {givenVibe}/{expectedPer}
                    <span className="ml-2 font-mono-num text-[var(--points)]">
                      {formatPoints(pts)} очк.
                    </span>
                    {lowSkill && (
                      <span className="ml-2 text-xs text-[var(--danger)]">мало голосов</span>
                    )}
                  </p>
                );
              })}
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
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
