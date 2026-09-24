"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MATCH_STATUS_LABELS, POSITION_LABELS } from "@/lib/labels";
import { displayName, formatDate, parseJsonArray } from "@/lib/utils";
import { PlayerLink } from "@/components/PlayerLink";
import {
  lineupForTeam,
  parseTeamAssignments,
  type LineupSlot,
} from "@/lib/match-lineup";
import type { MatchSession, MatchGame, User } from "@prisma/client";

type Session = MatchSession & { games: MatchGame[] };
type Student = User;
type DraftSlot = { userId: string; position: number };
type DraftTagged = DraftSlot & { team: "RADIANT" | "DIRE" };

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftRadiant, setDraftRadiant] = useState<DraftSlot[]>([]);
  const [draftDire, setDraftDire] = useState<DraftSlot[]>([]);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const studentMap = useMemo(
    () => Object.fromEntries(students.map((s) => [s.id, s])),
    [students]
  );

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

  function startEdit(session: Session) {
    const assignments = parseTeamAssignments(session.teamAssignments);
    const radiantIds = parseJsonArray(session.radiantPlayerIds);
    const direIds = parseJsonArray(session.direPlayerIds);
    setDraftRadiant(
      lineupForTeam("RADIANT", radiantIds, assignments).map((s) => ({
        userId: s.userId,
        position: s.position,
      }))
    );
    setDraftDire(
      lineupForTeam("DIRE", direIds, assignments).map((s) => ({
        userId: s.userId,
        position: s.position,
      }))
    );
    setEditingId(session.id);
    setEditError("");
  }

  /** Свап выбранного игрока со слотом (команда + позиция) */
  function assignPlayer(team: "RADIANT" | "DIRE", position: number, newUserId: string) {
    setEditError("");
    const all: DraftTagged[] = [
      ...draftRadiant.map((s) => ({ ...s, team: "RADIANT" as const })),
      ...draftDire.map((s) => ({ ...s, team: "DIRE" as const })),
    ];
    const tIdx = all.findIndex((s) => s.team === team && s.position === position);
    const sIdx = all.findIndex((s) => s.userId === newUserId);
    if (tIdx < 0 || sIdx < 0) return;
    if (all[tIdx].userId === newUserId) return;

    const a = all[tIdx];
    const b = all[sIdx];
    all[tIdx] = { userId: b.userId, position: a.position, team: a.team };
    all[sIdx] = { userId: a.userId, position: b.position, team: b.team };

    setDraftRadiant(
      all
        .filter((s) => s.team === "RADIANT")
        .map(({ userId, position: p }) => ({ userId, position: p }))
        .sort((x, y) => x.position - y.position)
    );
    setDraftDire(
      all
        .filter((s) => s.team === "DIRE")
        .map(({ userId, position: p }) => ({ userId, position: p }))
        .sort((x, y) => x.position - y.position)
    );
  }

  async function saveEdit(sessionId: string) {
    setSaving(true);
    setEditError("");
    try {
      const res = await fetch("/api/matches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          action: "updateTeams",
          radiant: draftRadiant,
          dire: draftDire,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEditError(typeof data.error === "string" ? data.error : "Не удалось сохранить");
        return;
      }
      setEditingId(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
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
        const radiantIds = parseJsonArray(session.radiantPlayerIds);
        const direIds = parseJsonArray(session.direPlayerIds);
        const assignments = parseTeamAssignments(session.teamAssignments);
        const radiantLineup = lineupForTeam("RADIANT", radiantIds, assignments);
        const direLineup = lineupForTeam("DIRE", direIds, assignments);
        const isEditing = editingId === session.id;
        const canEdit = session.status !== "COMPLETED" && radiantIds.length === 5;

        return (
          <Card key={session.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>{formatDate(session.date)}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge>{MATCH_STATUS_LABELS[session.status]}</Badge>
                  {canEdit && !isEditing && (
                    <Button variant="secondary" size="sm" onClick={() => startEdit(session)}>
                      Править состав
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {isEditing ? (
                <div className="space-y-4">
                  <p className="text-sm text-[var(--text-3)]">
                    Смена игрока в слоте — свап с тем, кто сейчас на этой позиции.
                    {session.games.length > 0 && (
                      <span className="text-[var(--danger)]">
                        {" "}
                        Уже есть сыгранные игры — правка влияет на следующие и off-role.
                      </span>
                    )}
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <EditTeamBlock
                      title="Radiant"
                      team="RADIANT"
                      slots={draftRadiant}
                      pool={[...draftRadiant, ...draftDire]}
                      map={studentMap}
                      onAssign={assignPlayer}
                    />
                    <EditTeamBlock
                      title="Dire"
                      team="DIRE"
                      slots={draftDire}
                      pool={[...draftRadiant, ...draftDire]}
                      map={studentMap}
                      onAssign={assignPlayer}
                    />
                  </div>
                  {editError && <p className="text-sm text-[var(--danger)]">{editError}</p>}
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => saveEdit(session.id)} disabled={saving}>
                      {saving ? "Сохранение..." : "Сохранить состав"}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setEditingId(null);
                        setEditError("");
                      }}
                      disabled={saving}
                    >
                      Отмена
                    </Button>
                  </div>
                </div>
              ) : (
                radiantLineup.length > 0 && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <TeamBlock title="Radiant" lineup={radiantLineup} map={studentMap} />
                    <TeamBlock title="Dire" lineup={direLineup} map={studentMap} />
                  </div>
                )
              )}

              {session.status === "TEAMS_SET" && !isEditing && (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => recordResult(session.id, "RADIANT", session.games.length + 1)}>
                    Победа Radiant (игра {session.games.length + 1})
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => recordResult(session.id, "DIRE", session.games.length + 1)}
                  >
                    Победа Dire (игра {session.games.length + 1})
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => recordResult(session.id, "DRAW", session.games.length + 1)}
                  >
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
                  {session.status === "TEAMS_SET" && !isEditing && (
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
  lineup,
  map,
}: {
  title: string;
  lineup: LineupSlot[];
  map: Record<string, Student>;
}) {
  return (
    <div className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--control)] p-3">
      <p className="mb-2 font-semibold text-[var(--text)]">{title}</p>
      <ul className="space-y-1.5 text-sm">
        {lineup.map((slot) => (
          <li key={`${slot.team}-${slot.position}`} className="flex items-center gap-2">
            <span className="inline-flex h-6 min-w-[4.5rem] shrink-0 items-center justify-center rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 font-mono-num text-[10px] text-[var(--text-2)]">
              {POSITION_LABELS[slot.position] ?? `поз. ${slot.position}`}
            </span>
            {map[slot.userId] ? (
              <PlayerLink user={map[slot.userId]} className="inline" />
            ) : (
              slot.userId
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EditTeamBlock({
  title,
  team,
  slots,
  pool,
  map,
  onAssign,
}: {
  title: string;
  team: "RADIANT" | "DIRE";
  slots: DraftSlot[];
  pool: DraftSlot[];
  map: Record<string, Student>;
  onAssign: (team: "RADIANT" | "DIRE", position: number, userId: string) => void;
}) {
  const byPos = Object.fromEntries(slots.map((s) => [s.position, s]));

  return (
    <div className="rounded-[var(--radius-control)] border border-[var(--admin-border)] bg-[var(--admin-bg)] p-3">
      <p className="mb-2 font-semibold text-[var(--admin)]">{title}</p>
      <ul className="space-y-2">
        {[1, 2, 3, 4, 5].map((pos) => {
          const slot = byPos[pos];
          return (
            <li key={pos} className="flex items-center gap-2">
              <span className="w-[4.5rem] shrink-0 font-mono-num text-[10px] text-[var(--text-3)]">
                {POSITION_LABELS[pos]}
              </span>
              <select
                className="flex h-9 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)]"
                value={slot?.userId ?? ""}
                onChange={(e) => {
                  if (e.target.value) onAssign(team, pos, e.target.value);
                }}
              >
                {pool.map((p) => (
                  <option key={p.userId} value={p.userId}>
                    {map[p.userId] ? displayName(map[p.userId]) : p.userId}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
