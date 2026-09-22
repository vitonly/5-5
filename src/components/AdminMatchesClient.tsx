"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MATCH_STATUS_LABELS } from "@/lib/labels";
import { displayName, formatDate, parseJsonArray } from "@/lib/utils";
import { PlayerLink } from "@/components/PlayerLink";
import type { MatchSession, MatchGame, User } from "@prisma/client";

type Session = MatchSession & { games: MatchGame[] };
type Student = User;

export function AdminMatchesClient({
  sessions: initial,
  students,
}: {
  sessions: Session[];
  students: Student[];
}) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);

  function togglePlayer(id: string) {
    setSelectedPlayers((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      if (prev.length >= 10) return prev;
      return [...prev, id];
    });
  }

  async function createSession() {
    await fetch("/api/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, playerIds: selectedPlayers }),
    });
    setDate("");
    setSelectedPlayers([]);
    router.refresh();
  }

  async function recordResult(sessionId: string, winnerTeam: string, gameNumber: number) {
    await fetch("/api/matches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, winnerTeam, gameNumber }),
    });
    router.refresh();
  }

  async function completeSession(sessionId: string) {
    await fetch("/api/matches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, completeSession: true }),
    });
    router.refresh();
  }

  async function undoLastGame(sessionId: string, gameId: string) {
    if (!confirm("Отменить последнюю игру? Очки и стрик откатятся.")) return;
    await fetch("/api/matches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, undoGameId: gameId }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Новая сессия 5v5</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Дата (суббота)</Label>
            <Input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Игроки ({selectedPlayers.length}/10)</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {students.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => togglePlayer(s.id)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    selectedPlayers.includes(s.id)
                      ? "border-[var(--admin-border)] bg-[var(--admin-bg)] text-[var(--admin)]"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)]"
                  }`}
                >
                  {displayName(s)}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={createSession} disabled={!date || selectedPlayers.length !== 10}>
            Сформировать команды
          </Button>
        </CardContent>
      </Card>

      {initial.map((session) => {
        const radiant = parseJsonArray(session.radiantPlayerIds);
        const dire = parseJsonArray(session.direPlayerIds);
        const studentMap = Object.fromEntries(students.map((s) => [s.id, s]));

        return (
          <Card key={session.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{formatDate(session.date)}</CardTitle>
                <Badge>{MATCH_STATUS_LABELS[session.status]}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {radiant.length > 0 && (
                <div className="grid gap-4 md:grid-cols-2">
                  <TeamBlock title="Radiant" ids={radiant} map={studentMap} />
                  <TeamBlock title="Dire" ids={dire} map={studentMap} />
                </div>
              )}
              {session.status === "TEAMS_SET" && (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => recordResult(session.id, "RADIANT", session.games.length + 1)}>
                    Победа Radiant (игра {session.games.length + 1})
                  </Button>
                  <Button variant="secondary" onClick={() => recordResult(session.id, "DIRE", session.games.length + 1)}>
                    Победа Dire (игра {session.games.length + 1})
                  </Button>
                  <Button variant="outline" onClick={() => recordResult(session.id, "DRAW", session.games.length + 1)}>
                    Ничья (игра {session.games.length + 1})
                  </Button>
                  <Button variant="outline" onClick={() => completeSession(session.id)}>
                    Завершить сессию
                  </Button>
                </div>
              )}
              {session.games.length > 0 && (
                <div className="space-y-2 text-sm text-[var(--text-3)]">
                  <p>
                    Результаты:{" "}
                    {session.games.map((g) => `Игра ${g.gameNumber}: ${g.winnerTeam}`).join(" · ")}
                  </p>
                  <p>
                    Счёт: Radiant{" "}
                    {session.games.filter((g) => g.winnerTeam === "RADIANT").length} — Dire{" "}
                    {session.games.filter((g) => g.winnerTeam === "DIRE").length}
                  </p>
                  {session.status === "TEAMS_SET" && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        const last = session.games[session.games.length - 1];
                        if (last) undoLastGame(session.id, last.id);
                      }}
                    >
                      Отменить последнюю игру
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function TeamBlock({
  title,
  ids,
  map,
}: {
  title: string;
  ids: string[];
  map: Record<string, Student>;
}) {
  return (
    <div className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--control)] p-3">
      <p className="mb-2 font-semibold text-[var(--text)]">{title}</p>
      <ul className="space-y-1 text-sm">
        {ids.map((id, index) => (
          <li key={id} className="flex items-center gap-2">
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[var(--surface)] text-xs text-[var(--text-2)] border border-[var(--border)]">
              {index + 1}
            </span>
            {map[id] ? <PlayerLink user={map[id]} className="inline" /> : id}
          </li>
        ))}
      </ul>
    </div>
  );
}
