"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MATCH_MODE_LABELS,
  MATCH_RSVP_LABELS,
  MATCH_STATUS_LABELS,
  POSITION_LABELS,
} from "@/lib/labels";
import { displayName, formatDate, parseJsonArray } from "@/lib/utils";
import { PlayerLink } from "@/components/PlayerLink";
import {
  lineupForTeam,
  parseTeamAssignments,
  type LineupSlot,
} from "@/lib/match-lineup";
import type {
  MatchGame,
  MatchRsvp,
  MatchSession,
  PlayerProfile,
  User,
} from "@prisma/client";
import { PlayerRolesDisplay } from "@/components/PlayerRolesDisplay";
import { PowerPill } from "@/components/StatPills";

type RsvpWithUser = MatchRsvp & { user: User };
type Session = MatchSession & {
  games: MatchGame[];
  rsvps?: RsvpWithUser[];
};
type Student = User & { profile: PlayerProfile | null };
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
  const [openDate, setOpenDate] = useState("");
  const [inviteIds, setInviteIds] = useState<string[]>([]);
  const [inviteImageUrl, setInviteImageUrl] = useState("");
  const [uploadingInvite, setUploadingInvite] = useState(false);
  const [creatingOpen, setCreatingOpen] = useState(false);
  const [openError, setOpenError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftRadiant, setDraftRadiant] = useState<DraftSlot[]>([]);
  const [draftDire, setDraftDire] = useState<DraftSlot[]>([]);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const studentMap = useMemo(
    () => Object.fromEntries(students.map((s) => [s.id, s])),
    [students]
  );

  const withTelegram = useMemo(
    () => students.filter((s) => Boolean(s.telegramChatId)),
    [students]
  );

  function togglePlayer(id: string) {
    setSelectedPlayers((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      if (prev.length >= 10) return prev;
      return [...prev, id];
    });
  }

  function toggleInvite(id: string) {
    setInviteIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
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

  async function createOpenSignup(allWithTg: boolean) {
    setCreatingOpen(true);
    setOpenError("");
    try {
      const res = await fetch("/api/matches/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          allWithTg
            ? { date: openDate, inviteAll: true, inviteImageUrl: inviteImageUrl || null }
            : {
                date: openDate,
                inviteUserIds: inviteIds,
                inviteImageUrl: inviteImageUrl || null,
              }
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOpenError(typeof data.error === "string" ? data.error : "Ошибка");
        return;
      }
      setOpenDate("");
      setInviteIds([]);
      setInviteImageUrl("");
      router.refresh();
    } finally {
      setCreatingOpen(false);
    }
  }

  async function uploadInviteImage(file: File) {
    setUploadingInvite(true);
    setOpenError("");
    try {
      const { uploadAppFile } = await import("@/lib/upload-client");
      const data = await uploadAppFile(file);
      if (!data.url) throw new Error("Нет URL");
      setInviteImageUrl(data.url);
    } catch (e) {
      setOpenError(e instanceof Error ? e.message : "Не удалось загрузить фото");
    } finally {
      setUploadingInvite(false);
    }
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

  async function deleteSession(sessionId: string, label: string) {
    if (
      !confirm(
        `Удалить сессию «${label}» целиком?\nОчки и винрейт за сыгранные игры откатятся. Это нельзя отменить.`
      )
    ) {
      return;
    }
    const res = await fetch("/api/matches", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(typeof data.error === "string" ? data.error : "Не удалось удалить");
      return;
    }
    router.refresh();
  }

  async function startSession(sessionId: string) {
    const res = await fetch("/api/matches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, action: "startSession" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(typeof data.error === "string" ? data.error : "Не удалось стартовать");
      return;
    }
    router.refresh();
  }

  async function confirmLineups(sessionId: string) {
    if (
      !confirm(
        "Утвердить составы? Игрокам уйдёт уведомление в Telegram. После этого можно стартовать сессию."
      )
    ) {
      return;
    }
    const res = await fetch("/api/matches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, action: "confirmLineups" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(typeof data.error === "string" ? data.error : "Не удалось утвердить");
      return;
    }
    router.refresh();
  }

  async function removeFromSignup(sessionId: string, userId: string, name: string) {
    if (!confirm(`Убрать ${name} из 5v5? Место займёт первый из очереди, команды пересоберутся.`)) {
      return;
    }
    const res = await fetch("/api/matches/signup", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "removePlayer", sessionId, userId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(typeof data.error === "string" ? data.error : "Не удалось убрать");
      return;
    }
    router.refresh();
  }

  async function reinvitePlayer(sessionId: string, userId: string, name: string) {
    if (!confirm(`Отправить ${name} повторный запрос в Telegram?`)) return;
    const res = await fetch("/api/matches/signup", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reinvite", sessionId, userId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(typeof data.error === "string" ? data.error : "Не удалось отправить");
      return;
    }
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
          <CardTitle>Свой состав (вручную)</CardTitle>
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

      <Card>
        <CardHeader>
          <CardTitle>Открытая запись (Telegram)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[var(--text-3)]">
            Ученикам уйдёт сообщение с кнопками «Я играю» / «Не играю». Первые 10 — в состав,
            остальные в очередь. С Telegram: {withTelegram.length} из {students.length}.
          </p>
          <div>
            <Label>Дата</Label>
            <Input
              type="datetime-local"
              value={openDate}
              onChange={(e) => setOpenDate(e.target.value)}
            />
          </div>
          <div>
            <Label>Фото к опросу в Telegram (необязательно)</Label>
            <p className="mt-1 text-xs text-[var(--text-4)]">
              Придёт вместе с кнопками «Я играю» / «Не играю». JPG/PNG, до 10 МБ. Нужен публичный
              URL (Vercel Blob).
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="max-w-xs cursor-pointer text-sm"
                disabled={uploadingInvite || creatingOpen}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadInviteImage(file);
                  e.target.value = "";
                }}
              />
              {uploadingInvite && (
                <span className="text-xs text-[var(--text-3)]">Загрузка…</span>
              )}
              {inviteImageUrl && !uploadingInvite && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setInviteImageUrl("")}
                >
                  Убрать фото
                </Button>
              )}
            </div>
            {inviteImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={inviteImageUrl}
                alt="Превью инвайта"
                className="mt-3 max-h-48 rounded-[var(--radius-control)] border border-[var(--border)] object-contain"
              />
            )}
          </div>
          <div>
            <Label>Кому отправить ({inviteIds.length})</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {students.map((s) => {
                const hasTg = Boolean(s.telegramChatId);
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={!hasTg}
                    onClick={() => hasTg && toggleInvite(s.id)}
                    title={hasTg ? undefined : "Нет привязанного Telegram"}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      !hasTg
                        ? "cursor-not-allowed border-[var(--border)] opacity-40"
                        : inviteIds.includes(s.id)
                          ? "border-[var(--admin-border)] bg-[var(--admin-bg)] text-[var(--admin)]"
                          : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)]"
                    }`}
                  >
                    {displayName(s)}
                    {!hasTg ? " · нет TG" : ""}
                  </button>
                );
              })}
            </div>
          </div>
          {openError && <p className="text-sm text-[var(--danger)]">{openError}</p>}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => createOpenSignup(false)}
              disabled={!openDate || inviteIds.length === 0 || creatingOpen}
            >
              {creatingOpen ? "Отправка…" : "Открыть запись выбранным"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => createOpenSignup(true)}
              disabled={!openDate || withTelegram.length === 0 || creatingOpen}
            >
              Всем с Telegram ({withTelegram.length})
            </Button>
          </div>
        </CardContent>
      </Card>

      {initial.map((session) => {
        const radiantIds = parseJsonArray(session.radiantPlayerIds);
        const direIds = parseJsonArray(session.direPlayerIds);
        const assignments = parseTeamAssignments(session.teamAssignments);
        const radiantLineup = lineupForTeam("RADIANT", radiantIds, assignments);
        const direLineup = lineupForTeam("DIRE", direIds, assignments);
        const isEditing = editingId === session.id;
        const beforeStart =
          session.status === "PLANNED" ||
          session.status === "TEAMS_SET" ||
          session.status === "LINEUPS_CONFIRMED";
        const canEdit =
          beforeStart &&
          session.status !== "COMPLETED" &&
          radiantIds.length === 5;
        const rsvps = session.rsvps ?? [];
        const joined = rsvps.filter((r) => r.status === "JOINED");
        const queued = rsvps
          .filter((r) => r.status === "QUEUED")
          .sort((a, b) => {
            const ta = a.respondedAt ? new Date(a.respondedAt).getTime() : 0;
            const tb = b.respondedAt ? new Date(b.respondedAt).getTime() : 0;
            return ta - tb;
          });
        const declined = rsvps.filter(
          (r) => r.status === "DECLINED" || r.status === "REMOVED"
        );
        const invited = rsvps.filter((r) => r.status === "INVITED");
        const isOpen = session.mode === "OPEN_SIGNUP";
        const radiantPower = sumPower(radiantLineup, studentMap);
        const direPower = sumPower(direLineup, studentMap);
        const powerDiff = Math.abs(radiantPower - direPower);

        return (
          <Card key={session.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>{formatDate(session.date)}</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="admin">
                    {MATCH_MODE_LABELS[session.mode] ?? session.mode}
                  </Badge>
                  <Badge>{MATCH_STATUS_LABELS[session.status]}</Badge>
                  {canEdit && !isEditing && (
                    <Button variant="secondary" size="sm" onClick={() => startEdit(session)}>
                      Править состав
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteSession(session.id, formatDate(session.date))}
                  >
                    Удалить
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {isOpen && beforeStart && (
                <div className="space-y-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--control)] p-3 text-sm">
                  <p className="font-medium text-[var(--text)]">
                    Запись: {joined.length}/10 в составе · очередь {queued.length} · ждут{" "}
                    {invited.length}
                  </p>
                  {joined.length > 0 && (
                    <RsvpList
                      title="В составе"
                      items={joined}
                      canRemove={beforeStart}
                      onRemove={(u) =>
                        removeFromSignup(session.id, u.id, displayName(u))
                      }
                    />
                  )}
                  {queued.length > 0 && (
                    <RsvpList
                      title="Очередь"
                      items={queued}
                      canRemove={beforeStart}
                      showQueueIndex
                      onRemove={(u) =>
                        removeFromSignup(session.id, u.id, displayName(u))
                      }
                    />
                  )}
                  {invited.length > 0 && (
                    <RsvpList title="Ещё не ответили" items={invited} />
                  )}
                  {declined.length > 0 && (
                    <RsvpList
                      title="Отказы / сняты"
                      items={declined}
                      canReinvite={beforeStart}
                      onReinvite={(u) =>
                        reinvitePlayer(session.id, u.id, displayName(u))
                      }
                    />
                  )}
                </div>
              )}

              {isEditing ? (
                <div className="space-y-4">
                  <p className="text-sm text-[var(--text-3)]">
                    Смена игрока в слоте — свап с тем, кто сейчас на этой позиции.
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
                  <div className="space-y-3">
                    <div className="grid gap-4 md:grid-cols-2">
                      <TeamBlock
                        title="Radiant"
                        lineup={radiantLineup}
                        map={studentMap}
                        teamPower={radiantPower}
                      />
                      <TeamBlock
                        title="Dire"
                        lineup={direLineup}
                        map={studentMap}
                        teamPower={direPower}
                      />
                    </div>
                    <p className="font-mono-num text-sm text-[var(--text-2)]">
                      Сумма силы: Radiant <b>{radiantPower}</b> · Dire <b>{direPower}</b>
                      {" · "}
                      Разница: <b>{powerDiff}</b>
                      {radiantPower !== direPower && (
                        <span className="text-[var(--text-4)]">
                          {" "}
                          ({radiantPower > direPower ? "Radiant" : "Dire"} сильнее)
                        </span>
                      )}
                    </p>
                  </div>
                )
              )}

              {session.status === "TEAMS_SET" && !isEditing && (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => confirmLineups(session.id)}>
                    Утвердить составы
                  </Button>
                  <Button variant="outline" onClick={() => completeSession(session.id)}>
                    Отменить / завершить без игр
                  </Button>
                </div>
              )}

              {session.status === "LINEUPS_CONFIRMED" && !isEditing && (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => startSession(session.id)}>
                    Старт сессии (все за ПК)
                  </Button>
                  <Button variant="outline" onClick={() => completeSession(session.id)}>
                    Отменить / завершить без игр
                  </Button>
                </div>
              )}

              {session.status === "IN_PROGRESS" && !isEditing && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() =>
                      recordResult(session.id, "RADIANT", session.games.length + 1)
                    }
                  >
                    Победа Radiant (игра {session.games.length + 1})
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      recordResult(session.id, "DIRE", session.games.length + 1)
                    }
                  >
                    Победа Dire (игра {session.games.length + 1})
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      recordResult(session.id, "DRAW", session.games.length + 1)
                    }
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
                  {session.status === "IN_PROGRESS" && !isEditing && (
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

function RsvpList({
  title,
  items,
  canRemove,
  canReinvite,
  showQueueIndex,
  onRemove,
  onReinvite,
}: {
  title: string;
  items: RsvpWithUser[];
  canRemove?: boolean;
  canReinvite?: boolean;
  showQueueIndex?: boolean;
  onRemove?: (user: User) => void;
  onReinvite?: (user: User) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-wide text-[var(--text-4)]">{title}</p>
      <ul className="space-y-1">
        {items.map((r, idx) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2">
            {showQueueIndex && (
              <span className="font-mono-num text-xs text-[var(--text-4)]">#{idx + 1}</span>
            )}
            <PlayerLink user={r.user} className="inline" />
            <span className="text-xs text-[var(--text-4)]">
              {MATCH_RSVP_LABELS[r.status]}
            </span>
            {canRemove && onRemove && (r.status === "JOINED" || r.status === "QUEUED") && (
              <Button
                variant="destructive"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onRemove(r.user)}
              >
                Убрать
              </Button>
            )}
            {canReinvite &&
              onReinvite &&
              (r.status === "DECLINED" || r.status === "REMOVED") && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => onReinvite(r.user)}
                >
                  Отправить снова
                </Button>
              )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function sumPower(lineup: LineupSlot[], map: Record<string, Student>) {
  return lineup.reduce((sum, slot) => sum + (map[slot.userId]?.profile?.finalRating ?? 0), 0);
}

function TeamBlock({
  title,
  lineup,
  map,
  teamPower,
}: {
  title: string;
  lineup: LineupSlot[];
  map: Record<string, Student>;
  teamPower: number;
}) {
  return (
    <div className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--control)] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-semibold text-[var(--text)]">{title}</p>
        <span className="font-mono-num text-xs text-[var(--text-3)]">
          Σ сила {teamPower}
        </span>
      </div>
      <ul className="space-y-2 text-sm">
        {lineup.map((slot) => {
          const student = map[slot.userId];
          const power = student?.profile?.finalRating ?? 0;
          return (
            <li
              key={`${slot.team}-${slot.position}`}
              className="flex flex-col gap-1 border-b border-[var(--border-soft)] pb-2 last:border-0 last:pb-0"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex h-6 min-w-[4.5rem] shrink-0 items-center justify-center rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 font-mono-num text-[10px] text-[var(--text-2)]">
                  {POSITION_LABELS[slot.position] ?? `поз. ${slot.position}`}
                </span>
                {student ? (
                  <PlayerLink user={student} className="inline" />
                ) : (
                  slot.userId
                )}
                <PowerPill value={power} />
              </div>
              <PlayerRolesDisplay profile={student?.profile} className="pl-1" />
            </li>
          );
        })}
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
