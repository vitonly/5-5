"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
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
import { teamDisplayName } from "@/lib/team-names";
import { usePasteImage } from "@/lib/use-paste-image";
import { RESHUFFLE_INTENSITY_LABELS, type ReshuffleIntensity } from "@/lib/team-balance";

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
  const [sessions, setSessions] = useState(initial);
  const [date, setDate] = useState("");
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [openDate, setOpenDate] = useState("");
  const [inviteIds, setInviteIds] = useState<string[]>([]);
  const [inviteImageUrl, setInviteImageUrl] = useState("");
  const [uploadingInvite, setUploadingInvite] = useState(false);
  const [creatingOpen, setCreatingOpen] = useState(false);
  const [openError, setOpenError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingGame, setEditingGame] = useState<1 | 2>(1);
  const [draftRadiant, setDraftRadiant] = useState<DraftSlot[]>([]);
  const [draftDire, setDraftDire] = useState<DraftSlot[]>([]);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [reshuffleIntensity, setReshuffleIntensity] = useState<ReshuffleIntensity>(3);
  const [onlyListedRoles, setOnlyListedRoles] = useState(true);

  function intensityControl() {
    return (
      <div className="flex flex-col gap-2 sm:max-w-md">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-[var(--text-3)]">
            Сила пересборки:{" "}
            <span className="font-medium text-[var(--text)]">
              {reshuffleIntensity} — {RESHUFFLE_INTENSITY_LABELS[reshuffleIntensity]}
            </span>
          </span>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={reshuffleIntensity}
            onChange={(e) =>
              setReshuffleIntensity(Number(e.target.value) as ReshuffleIntensity)
            }
            className="w-full accent-[var(--accent)]"
            disabled={saving}
          />
          <span className="flex justify-between text-[10px] text-[var(--text-4)]">
            <span>мягко</span>
            <span>жёстко</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-xs text-[var(--text-3)] cursor-pointer select-none">
          <input
            type="checkbox"
            className="mt-0.5 accent-[var(--accent)]"
            checked={onlyListedRoles}
            onChange={(e) => setOnlyListedRoles(e.target.checked)}
            disabled={saving}
          />
          <span>
            Не ставить на роль, которой нет у игрока
            <span className="block text-[10px] text-[var(--text-4)]">
              Только primary / secondary из профиля
            </span>
          </span>
        </label>
      </div>
    );
  }

  useEffect(() => {
    setSessions(initial);
  }, [initial]);

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

  const onInvitePaste = useCallback(async (url: string) => {
    setInviteImageUrl(url);
    setOpenError("");
  }, []);

  const { onPaste: pasteInviteImage, uploading: pasteInviteUploading } = usePasteImage({
    onUploaded: onInvitePaste,
    onError: (msg) => setOpenError(msg),
    enabled: !uploadingInvite && !creatingOpen,
  });

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

  async function generateGame2(sessionId: string, intensity = reshuffleIntensity) {
    setSaving(true);
    try {
      const res = await fetch("/api/matches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          action: "generateGame2",
          intensity,
          onlyListedRoles,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Ошибка");
        return;
      }
      if (data.session) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === data.session.id
              ? {
                  ...s,
                  ...data.session,
                  games: s.games,
                  rsvps: s.rsvps,
                }
              : s
          )
        );
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function confirmLineupsGame2(sessionId: string) {
    if (
      !confirm(
        "Утвердить состав на игру №2? Игрокам уйдёт уведомление в Telegram."
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/matches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, action: "confirmLineupsGame2" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(typeof data.error === "string" ? data.error : "Не удалось утвердить");
        return;
      }
      if (data.session) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === data.session.id
              ? { ...s, ...data.session, games: s.games, rsvps: s.rsvps }
              : s
          )
        );
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function sendMvpInvites(sessionId: string) {
    const res = await fetch("/api/matches/mvp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, action: "sendInvites" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) alert(data.error || "Ошибка");
    else alert("Опросы MVP отправлены в TG");
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

  function startEdit(session: Session, game: 1 | 2 = 1) {
    const assignments = parseTeamAssignments(
      game === 2 ? session.teamAssignmentsGame2 : session.teamAssignments
    );
    const radiantIds =
      game === 2
        ? Object.entries(assignments)
            .filter(([, a]) => a.team === "RADIANT")
            .map(([id]) => id)
        : parseJsonArray(session.radiantPlayerIds);
    const direIds =
      game === 2
        ? Object.entries(assignments)
            .filter(([, a]) => a.team === "DIRE")
            .map(([id]) => id)
        : parseJsonArray(session.direPlayerIds);
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
    setEditingGame(game);
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
          game: editingGame,
          radiant: draftRadiant,
          dire: draftDire,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEditError(typeof data.error === "string" ? data.error : "Не удалось сохранить");
        return;
      }
      if (data.session) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === data.session.id
              ? {
                  ...s,
                  ...data.session,
                  games: s.games,
                  rsvps: s.rsvps,
                }
              : s
          )
        );
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
          <div onPaste={pasteInviteImage} tabIndex={0}>
            <Label>Фото к опросу в Telegram (необязательно)</Label>
            <p className="mt-1 text-xs text-[var(--text-4)]">
              Придёт вместе с кнопками «Я играю» / «Не играю». JPG/PNG, до 10 МБ. Можно Ctrl+V.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="max-w-xs cursor-pointer text-sm"
                disabled={uploadingInvite || pasteInviteUploading || creatingOpen}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadInviteImage(file);
                  e.target.value = "";
                }}
              />
              {(uploadingInvite || pasteInviteUploading) && (
                <span className="text-xs text-[var(--text-3)]">Загрузка…</span>
              )}
              {inviteImageUrl && !uploadingInvite && !pasteInviteUploading && (
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

      {sessions.map((session) => {
        const radiantIds = parseJsonArray(session.radiantPlayerIds);
        const direIds = parseJsonArray(session.direPlayerIds);
        const assignments = parseTeamAssignments(session.teamAssignments);
        const radiantLineup = lineupForTeam("RADIANT", radiantIds, assignments);
        const direLineup = lineupForTeam("DIRE", direIds, assignments);
        const game2Assignments = parseTeamAssignments(session.teamAssignmentsGame2);
        const hasGame2 = Object.keys(game2Assignments).length > 0;
        const game2RadiantIds = Object.entries(game2Assignments)
          .filter(([, a]) => a.team === "RADIANT")
          .map(([id]) => id);
        const game2DireIds = Object.entries(game2Assignments)
          .filter(([, a]) => a.team === "DIRE")
          .map(([id]) => id);
        const game2RadiantLineup = hasGame2
          ? lineupForTeam("RADIANT", game2RadiantIds, game2Assignments)
          : [];
        const game2DireLineup = hasGame2
          ? lineupForTeam("DIRE", game2DireIds, game2Assignments)
          : [];
        const isEditing = editingId === session.id;
        const nameFromIds = (ids: string[], fallback: string) =>
          teamDisplayName(
            ids.map((id) => ({
              id,
              firstName: studentMap[id]?.firstName,
              lastName: studentMap[id]?.lastName,
              username: studentMap[id]?.username,
              finalRating: studentMap[id]?.profile?.finalRating ?? 0,
            })),
            fallback
          );
        const radiantName = nameFromIds(
          isEditing ? draftRadiant.map((s) => s.userId).filter(Boolean) : radiantIds,
          "Team A"
        );
        const direName = nameFromIds(
          isEditing ? draftDire.map((s) => s.userId).filter(Boolean) : direIds,
          "Team B"
        );
        const game2RadiantName = nameFromIds(game2RadiantIds, "Team A");
        const game2DireName = nameFromIds(game2DireIds, "Team B");
        const game2RadiantPower = sumPower(game2RadiantLineup, studentMap);
        const game2DirePower = sumPower(game2DireLineup, studentMap);
        const game2PowerDiff = Math.abs(game2RadiantPower - game2DirePower);
        const nextGameNumber = session.games.length + 1;
        const recordingGame2 = nextGameNumber >= 2 && hasGame2;
        const activeWinRadiantName = recordingGame2 ? game2RadiantName : radiantName;
        const activeWinDireName = recordingGame2 ? game2DireName : direName;
        const beforeStart =
          session.status === "PLANNED" ||
          session.status === "TEAMS_SET" ||
          session.status === "LINEUPS_CONFIRMED";
        const canEditGame1 =
          beforeStart &&
          session.status !== "COMPLETED" &&
          radiantIds.length === 5;
        const canEditGame2 =
          hasGame2 &&
          session.status !== "COMPLETED" &&
          (beforeStart ||
            (session.status === "IN_PROGRESS" && session.games.length < 2));
        const canEdit = canEditGame1 || canEditGame2;
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
                    <>
                      {canEditGame1 && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => startEdit(session, 1)}
                        >
                          Править №1
                        </Button>
                      )}
                      {canEditGame2 && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => startEdit(session, 2)}
                        >
                          Править №2
                        </Button>
                      )}
                    </>
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
                  <p className="font-display text-base font-semibold text-[var(--text)]">
                    Редактирование состава на игру №{editingGame}
                  </p>
                  <p className="text-sm text-[var(--text-3)]">
                    Смена игрока в слоте — свап с тем, кто сейчас на этой позиции.
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <EditTeamBlock
                      title={radiantName}
                      team="RADIANT"
                      slots={draftRadiant}
                      pool={[...draftRadiant, ...draftDire]}
                      map={studentMap}
                      onAssign={assignPlayer}
                    />
                    <EditTeamBlock
                      title={direName}
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
                      {saving
                        ? "Сохранение..."
                        : `Сохранить состав №${editingGame}`}
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
                    <p className="font-display text-base font-semibold text-[var(--text)]">
                      Состав на игру №1
                    </p>
                    <div className="grid gap-4 md:grid-cols-2">
                      <TeamBlock
                        title={radiantName}
                        lineup={radiantLineup}
                        map={studentMap}
                        teamPower={radiantPower}
                      />
                      <TeamBlock
                        title={direName}
                        lineup={direLineup}
                        map={studentMap}
                        teamPower={direPower}
                      />
                    </div>
                    <p className="font-mono-num text-sm text-[var(--text-2)]">
                      Сумма силы: {radiantName} <b>{radiantPower}</b> · {direName}{" "}
                      <b>{direPower}</b>
                      {" · "}
                      Разница: <b>{powerDiff}</b>
                      {radiantPower !== direPower && (
                        <span className="text-[var(--text-4)]">
                          {" "}
                          ({radiantPower > direPower ? radiantName : direName} сильнее)
                        </span>
                      )}
                    </p>
                  </div>
                )
              )}

              {session.status === "TEAMS_SET" && !isEditing && (
                <div className="space-y-2">
                  {!hasGame2 && intensityControl()}
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => confirmLineups(session.id)}>
                      Утвердить составы (игра 1)
                    </Button>
                    {!hasGame2 && (
                      <Button
                        variant="secondary"
                        disabled={saving}
                        onClick={() => generateGame2(session.id)}
                      >
                        Собрать состав на 2-ю игру
                      </Button>
                    )}
                    <Button variant="outline" onClick={() => completeSession(session.id)}>
                      Отменить / завершить без игр
                    </Button>
                  </div>
                </div>
              )}

              {(session.status === "LINEUPS_CONFIRMED" ||
                session.status === "IN_PROGRESS" ||
                session.status === "TEAMS_SET") &&
                hasGame2 &&
                !isEditing && (
                  <div className="space-y-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-display text-base font-semibold text-[var(--text)]">
                        Состав на игру №2
                      </p>
                      {session.lineupsGame2Confirmed ? (
                        <Badge variant="success">Утверждён · TG разослан</Badge>
                      ) : (
                        <Badge variant="warning">Черновик — утвердите</Badge>
                      )}
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <TeamBlock
                        title={game2RadiantName}
                        lineup={game2RadiantLineup}
                        map={studentMap}
                        teamPower={game2RadiantPower}
                      />
                      <TeamBlock
                        title={game2DireName}
                        lineup={game2DireLineup}
                        map={studentMap}
                        teamPower={game2DirePower}
                      />
                    </div>
                    <p className="font-mono-num text-sm text-[var(--text-2)]">
                      Сумма силы: {game2RadiantName} <b>{game2RadiantPower}</b> ·{" "}
                      {game2DireName} <b>{game2DirePower}</b>
                      {" · "}
                      Разница: <b>{game2PowerDiff}</b>
                      {game2RadiantPower !== game2DirePower && (
                        <span className="text-[var(--text-4)]">
                          {" "}
                          (
                          {game2RadiantPower > game2DirePower
                            ? game2RadiantName
                            : game2DireName}{" "}
                          сильнее)
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-[var(--text-3)]">
                      Пересборка с учётом позиций, ролей и баланса силы. Победа в обеих
                      играх за день даёт доп. очки (+2 за вторую победу подряд).
                    </p>
                    <div className="space-y-2">
                      {intensityControl()}
                      <div className="flex flex-wrap gap-2">
                        {!session.lineupsGame2Confirmed && (
                          <Button
                            disabled={saving}
                            onClick={() => confirmLineupsGame2(session.id)}
                          >
                            Утвердить состав на игру №2
                          </Button>
                        )}
                        <Button
                          variant="secondary"
                          disabled={saving}
                          onClick={() => generateGame2(session.id)}
                        >
                          Пересобрать 2-й состав
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

              {session.status === "LINEUPS_CONFIRMED" && !isEditing && (
                <div className="space-y-2">
                  {!hasGame2 && intensityControl()}
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => startSession(session.id)}>
                      Старт сессии (все за ПК)
                    </Button>
                    {!hasGame2 && (
                      <Button
                        variant="secondary"
                        disabled={saving}
                        onClick={() => generateGame2(session.id)}
                      >
                        Собрать состав на 2-ю игру
                      </Button>
                    )}
                    <Button variant="outline" onClick={() => sendMvpInvites(session.id)}>
                      MVP: опрос в TG
                    </Button>
                    <Button variant="outline" onClick={() => completeSession(session.id)}>
                      Отменить / завершить без игр
                    </Button>
                  </div>
                </div>
              )}

              {session.status === "IN_PROGRESS" && !isEditing && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-[var(--text)]">
                    Записать результат — игра {nextGameNumber}
                    {recordingGame2 ? " (состав №2)" : " (состав №1)"}
                  </p>
                  {!hasGame2 && intensityControl()}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() =>
                        recordResult(session.id, "RADIANT", nextGameNumber)
                      }
                    >
                      Победа {activeWinRadiantName}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => recordResult(session.id, "DIRE", nextGameNumber)}
                    >
                      Победа {activeWinDireName}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => recordResult(session.id, "DRAW", nextGameNumber)}
                    >
                      Ничья
                    </Button>
                    {!hasGame2 && (
                      <Button
                        variant="secondary"
                        disabled={saving}
                        onClick={() => generateGame2(session.id)}
                      >
                        Состав на 2-ю игру
                      </Button>
                    )}
                    <Button variant="outline" onClick={() => sendMvpInvites(session.id)}>
                      MVP: опрос в TG
                    </Button>
                    <Button variant="outline" onClick={() => completeSession(session.id)}>
                      Завершить сессию
                    </Button>
                  </div>
                </div>
              )}

              {session.games.length > 0 && (
                <div className="space-y-2 text-sm text-[var(--text-3)]">
                  <p>
                    Результаты:{" "}
                    {session.games
                      .map((g) => {
                        const useG2Names =
                          g.gameNumber >= 2 && hasGame2;
                        const rName = useG2Names ? game2RadiantName : radiantName;
                        const dName = useG2Names ? game2DireName : direName;
                        const w =
                          g.winnerTeam === "RADIANT"
                            ? rName
                            : g.winnerTeam === "DIRE"
                              ? dName
                              : "Ничья";
                        return `Игра ${g.gameNumber}: ${w}`;
                      })
                      .join(" · ")}
                  </p>
                  <p>
                    Счёт по командам игры 1: {radiantName}{" "}
                    {session.games.filter(
                      (g) => g.gameNumber === 1 && g.winnerTeam === "RADIANT"
                    ).length}{" "}
                    — {direName}{" "}
                    {session.games.filter(
                      (g) => g.gameNumber === 1 && g.winnerTeam === "DIRE"
                    ).length}
                    {hasGame2 && (
                      <>
                        {" · "}
                        игры 2: {game2RadiantName}{" "}
                        {session.games.filter(
                          (g) => g.gameNumber >= 2 && g.winnerTeam === "RADIANT"
                        ).length}{" "}
                        — {game2DireName}{" "}
                        {session.games.filter(
                          (g) => g.gameNumber >= 2 && g.winnerTeam === "DIRE"
                        ).length}
                      </>
                    )}
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
