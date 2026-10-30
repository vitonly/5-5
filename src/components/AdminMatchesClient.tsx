"use client";

import { toast } from "@/components/ui/toast";
import { parsePowerSnapshot } from "@/lib/match-power-snapshot";
import { RecipientPicker, useRecipients } from "@/components/RecipientPicker";
import { confirmAction } from "@/components/ui/confirm";
import { useMemo, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { ReplayUploads, type ReplaySummary } from "@/components/match/ReplayUploads";
import { PositionBadge } from "@/components/RoleIcon";
import { Segmented } from "@/components/ui/segmented";
import { seriesScoreByGame1Roster } from "@/lib/match-score";
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
import type { ActiveSeries } from "@/components/match/AdminSeriesCard";

type MvpVoteRow = {
  id: string;
  voterId: string;
  nomineeId: string;
  voter: {
    id: string;
    firstName: string;
    lastName?: string | null;
    username?: string | null;
  };
  nominee: {
    id: string;
    firstName: string;
    lastName?: string | null;
    username?: string | null;
  };
};
type PredictionRow = {
  id: string;
  userId: string;
  gameNumber: number;
  pick: string;
  user: {
    id: string;
    firstName: string;
    lastName?: string | null;
    username?: string | null;
  };
};
type RsvpWithUser = MatchRsvp & { user: User };
type Session = MatchSession & {
  games: MatchGame[];
  replays?: ReplaySummary[];
  rsvps?: RsvpWithUser[];
  mvpVotes?: MvpVoteRow[];
  predictions?: PredictionRow[];
  /** мини-сезон дня («Игры по сертификатам»), если это его игра */
  series?: { name: string } | null;
};
type Student = User & { profile: PlayerProfile | null };
type DraftSlot = { userId: string; position: number };
type DraftTagged = DraftSlot & { team: "RADIANT" | "DIRE" };

export function AdminMatchesClient({
  sessions: initial,
  students,
  coachId,
  activeSeries = null,
}: {
  sessions: Session[];
  students: Student[];
  /** id тренера, который открыл страницу: он тоже может играть 5на5 */
  coachId: string;
  /** Идущий мини-сезон («Игры по сертификатам») — тогда при создании 5v5 есть выбор, какой он */
  activeSeries?: ActiveSeries | null;
}) {
  const [createMode, setCreateMode] = useState<"open" | "manual">("open");
  // Какой 5v5 создаём: обычный или игру мини-сезона
  const [kind, setKind] = useState<"regular" | "series">("regular");
  const forSeries = kind === "series" && activeSeries !== null;
  const seriesBody = forSeries && activeSeries ? { seriesId: activeSeries.id } : {};
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
            className="range-points w-full"
            style={{ "--val": `${((reshuffleIntensity - 1) / 4) * 100}%` } as React.CSSProperties}
            disabled={saving}
          />
          <span className="flex justify-between text-[12px] text-[var(--text-3)]">
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
            <span className="block text-[12px] text-[var(--text-3)]">
              Для 1-й и 2-й игры: только роли из профиля. Если собрать нельзя — ошибка, без
              «подстановок»
            </span>
          </span>
        </label>
      </div>
    );
  }

  // Сервер прислал новые данные (router.refresh) — подхватываем их сразу при отрисовке
  const [syncedInitial, setSyncedInitial] = useState(initial);
  if (initial !== syncedInitial) {
    setSyncedInitial(initial);
    setSessions(initial);
    setEditingId(null);
    setEditError("");
  }

  const allStudentsMap = useMemo(
    () => Object.fromEntries(students.map((s) => [s.id, s])),
    [students]
  );
  // Вне карточек сессий сила — текущая из профилей
  const studentMap = allStudentsMap;

  // Только ученики: тренер записывает себя кнопкой «Я тоже играю», а не через Telegram
  // Игра мини-сезона — только его участники (тренер может играть всегда)
  const seriesSet = useMemo(
    () => (forSeries && activeSeries ? new Set(activeSeries.participantIds) : null),
    [forSeries, activeSeries]
  );
  const onlyStudents = useMemo(
    () => students.filter((s) => s.role === "STUDENT" && (!seriesSet || seriesSet.has(s.id))),
    [students, seriesSet]
  );
  // В «Свой состав» тренер первым в списке
  const manualPlayers = useMemo(
    () => [
      ...students.filter((s) => s.id === coachId),
      ...students.filter((s) => s.id !== coachId && (!seriesSet || seriesSet.has(s.id))),
    ],
    [students, coachId, seriesSet]
  );
  const [coachBusy, setCoachBusy] = useState(false);

  const withTelegram = useMemo(
    () => onlyStudents.filter((s) => Boolean(s.telegramChatId)),
    [onlyStudents]
  );

  function togglePlayer(id: string) {
    setSelectedPlayers((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      if (prev.length >= 10) return prev;
      return [...prev, id];
    });
  }

  // Группы учеников: запись на 5v5 можно открыть целой группе
  const { groups } = useRecipients();
  const pickerStudents = onlyStudents.map((s) => ({
    id: s.id,
    name: displayName(s),
    hasTelegram: Boolean(s.telegramChatId),
  }));

  async function createSession() {
    const res = await fetch("/api/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        playerIds: selectedPlayers,
        onlyListedRoles,
        ...seriesBody,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(typeof data.error === "string" ? data.error : "Не удалось создать сессию");
      return;
    }
    setDate("");
    setSelectedPlayers([]);
    router.refresh();
  }

  async function rebalanceGame1(sessionId: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/matches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          action: "rebalanceGame1",
          onlyListedRoles,
          intensity: reshuffleIntensity,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Не удалось пересобрать");
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
      toast.success("Состав на игру №1 пересобран");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function createOpenSignup(allWithTg: boolean, testToAdmin = false) {
    setCreatingOpen(true);
    setOpenError("");
    try {
      const res = await fetch("/api/matches/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          testToAdmin
            ? {
                date: openDate,
                testToAdmin: true,
                inviteImageUrl: inviteImageUrl || null,
              }
            : allWithTg
              ? {
                  date: openDate,
                  inviteAll: true,
                  inviteImageUrl: inviteImageUrl || null,
                  ...seriesBody,
                }
              : {
                  date: openDate,
                  inviteUserIds: inviteIds,
                  inviteImageUrl: inviteImageUrl || null,
                  ...seriesBody,
                }
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOpenError(typeof data.error === "string" ? data.error : "Ошибка");
        return;
      }
      if (testToAdmin) {
        toast.success("Тест отправлен вам в Telegram");
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

  async function completeSession(sessionId: string, opts?: { cancelWithoutGames?: boolean }) {
    const session = sessions.find((s) => s.id === sessionId);
    const hasGames = (session?.games.length ?? 0) > 0;
    const willSendMvp = hasGames && !opts?.cancelWithoutGames;
    if (
      !(await confirmAction(
        willSendMvp
          ? "Завершить сессию? Голосование MVP откроется, игрокам уйдёт опрос в Telegram."
          : "Завершить сессию без игр? Опрос MVP не отправится."
      ))
    ) {
      return;
    }
    const res = await fetch("/api/matches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, completeSession: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(typeof data.error === "string" ? data.error : "Не удалось завершить");
      return;
    }
    if (data.mvpError) {
      toast.error(`Сессия завершена, но MVP в TG не ушёл: ${data.mvpError}`);
    } else if (data.mvp) {
      toast.success(
        `Сессия завершена. MVP в TG: отправлено ${data.mvp.sent ?? 0}/${data.mvp.total ?? "?"}` +
          (data.mvp.skippedNoTg ? `, без TG: ${data.mvp.skippedNoTg}` : "") +
          (data.mvp.skippedVoted ? `, уже голосовали: ${data.mvp.skippedVoted}` : "") +
          (data.mvp.failed ? `, ошибки: ${data.mvp.failed}` : "")
      );
    }
    router.refresh();
  }

  async function deleteSession(sessionId: string, label: string) {
    if (
      !(await confirmAction(
        `Удалить сессию «${label}» целиком?\nОчки и винрейт за сыгранные игры откатятся. Это нельзя отменить.`
      ))
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
      toast.error(typeof data.error === "string" ? data.error : "Не удалось удалить");
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
      toast.error(typeof data.error === "string" ? data.error : "Не удалось стартовать");
      return;
    }
    router.refresh();
  }

  async function openPredictions(sessionId: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/matches/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, action: "open" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Не удалось открыть прогнозы");
        return;
      }
      toast.success(`Прогнозы открыты · в Telegram отправлено: ${data.sent ?? 0}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
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
        toast.error(data.error || "Ошибка");
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
      if (data.game2Notified) {
        toast.success("Состав на игру №2 собран и разослан в Telegram.");
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function confirmLineupsGame2(sessionId: string) {
    if (
      !(await confirmAction(
        "Утвердить состав на игру №2? Игрокам уйдёт уведомление в Telegram."
      ))
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
        toast.error(typeof data.error === "string" ? data.error : "Не удалось утвердить");
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
    if (!res.ok) {
      toast.error(data.error || "Ошибка");
      return;
    }
    toast.success(
      `MVP в TG: отправлено ${data.sent ?? 0}/${data.total ?? "?"}` +
        (data.skippedNoTg ? `, без TG: ${data.skippedNoTg}` : "") +
        (data.skippedVoted ? `, уже голосовали: ${data.skippedVoted}` : "") +
        (data.failed ? `, ошибки: ${data.failed}` : "")
    );
  }

  /** singleGame — за день одна игра: утверждаем только 1-й состав */
  async function confirmLineups(sessionId: string, singleGame = false) {
    if (
      !(await confirmAction(
        singleGame
          ? "Утвердить только 1-й состав (одна игра)? Игрокам уйдёт сообщение в Telegram с составом на игру №1. Если позже понадобится вторая игра — её состав можно собрать и утвердить отдельно."
          : "Утвердить оба состава? Игрокам уйдёт одно сообщение в Telegram с составами на игру №1 и №2. После этого можно открыть прогнозы и стартовать сессию."
      ))
    ) {
      return;
    }
    const res = await fetch("/api/matches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, action: "confirmLineups", singleGame }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(typeof data.error === "string" ? data.error : "Не удалось утвердить");
      return;
    }
    router.refresh();
  }

  async function removeFromSignup(sessionId: string, userId: string, name: string) {
    if (!(await confirmAction(`Убрать ${name} из 5v5? Место займёт первый из очереди, команды пересоберутся.`))) {
      return;
    }
    const res = await fetch("/api/matches/signup", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "removePlayer", sessionId, userId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(typeof data.error === "string" ? data.error : "Не удалось убрать");
      return;
    }
    router.refresh();
  }

  /** Взять текущую силу игроков из профилей (до старта игр), заново заморозить */
  async function refreshPower(sessionId: string) {
    if (
      !(await confirmAction(
        "Обновить силу игроков из профилей? Сила снова зафиксируется на текущих значениях. Составы сами не пересоберутся — при желании нажмите «Пересобрать»."
      ))
    ) {
      return;
    }
    const res = await fetch("/api/matches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, action: "refreshPower" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(typeof data.error === "string" ? data.error : "Не удалось обновить силу");
      return;
    }
    toast.success(`Сила обновлена у ${data.players ?? 0} игроков`);
    router.refresh();
  }

  /** Тренер записывается в открытый 5v5 или выходит из него */
  async function coachSignup(sessionId: string, join: boolean) {
    setCoachBusy(true);
    const res = await fetch("/api/matches/signup", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: join ? "coachJoin" : "coachLeave", sessionId }),
    });
    const data = await res.json().catch(() => ({}));
    setCoachBusy(false);
    if (!res.ok) {
      toast.error(typeof data.error === "string" ? data.error : "Не получилось");
      return;
    }
    toast.success(join ? `Вы записаны: ${data.message ?? ""}` : "Вы вышли из игры");
    router.refresh();
  }

  async function reinvitePlayer(sessionId: string, userId: string, name: string) {
    if (!(await confirmAction(`Отправить ${name} повторный запрос в Telegram?`))) return;
    const res = await fetch("/api/matches/signup", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reinvite", sessionId, userId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(typeof data.error === "string" ? data.error : "Не удалось отправить");
      return;
    }
    router.refresh();
  }

  async function undoLastGame(sessionId: string, gameId: string) {
    if (!(await confirmAction("Отменить последнюю игру? Очки и стрик откатятся."))) return;
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

  function applyDraftSwap(all: DraftTagged[]) {
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
    applyDraftSwap(all);
  }

  /** Свап двух слотов (роль/команда) — для drag-and-drop. */
  function swapSlots(
    fromTeam: "RADIANT" | "DIRE",
    fromPos: number,
    toTeam: "RADIANT" | "DIRE",
    toPos: number
  ) {
    setEditError("");
    if (fromTeam === toTeam && fromPos === toPos) return;
    const all: DraftTagged[] = [
      ...draftRadiant.map((s) => ({ ...s, team: "RADIANT" as const })),
      ...draftDire.map((s) => ({ ...s, team: "DIRE" as const })),
    ];
    const aIdx = all.findIndex((s) => s.team === fromTeam && s.position === fromPos);
    const bIdx = all.findIndex((s) => s.team === toTeam && s.position === toPos);
    if (aIdx < 0 || bIdx < 0) return;
    const aUser = all[aIdx].userId;
    const bUser = all[bIdx].userId;
    all[aIdx] = { ...all[aIdx], userId: bUser };
    all[bIdx] = { ...all[bIdx], userId: aUser };
    applyDraftSwap(all);
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
      <CollapsibleCard
        variant="create"
        title="Новый 5v5"
        description="Открытая запись через Telegram или свой состав вручную"
        defaultOpen={!sessions.some((x) => x.status !== "COMPLETED")}
      >
        <div className="space-y-4">
          {activeSeries && (
            <div className="space-y-1.5">
              <Label>Какой 5v5 собираем</Label>
              <Segmented
                value={kind}
                onChange={(v) => {
                  setKind(v);
                  // список игроков меняется — старый выбор сбрасываем
                  setInviteIds([]);
                  setSelectedPlayers([]);
                }}
                items={[
                  { value: "regular", label: "Обычный" },
                  { value: "series", label: `«${activeSeries.name}»` },
                ]}
              />
              {forSeries && (
                <p className="text-xs text-[var(--text-3)]">
                  В приглашении будет название мини-сезона. Очки — только в его таблицу. Позвать можно
                  только участников ({activeSeries.participantIds.length}).
                </p>
              )}
            </div>
          )}
          <Segmented
            value={createMode}
            onChange={setCreateMode}
            items={[
              { value: "open", label: "Открытая запись (Telegram)" },
              { value: "manual", label: "Свой состав" },
            ]}
          />
          {createMode === "manual" ? (
            <div className="space-y-4">
          <div>
            <Label>Дата (суббота)</Label>
            <Input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Игроки ({selectedPlayers.length}/10)</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {manualPlayers.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => togglePlayer(s.id)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    selectedPlayers.includes(s.id)
                      ? "border-[var(--admin-border)] bg-[var(--admin-bg)] text-[var(--admin-ink)]"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)]"
                  }`}
                >
                  {s.id === coachId ? "Я (тренер)" : displayName(s)}
                </button>
              ))}
            </div>
          </div>
          {intensityControl()}
          <Button onClick={createSession} disabled={!date || selectedPlayers.length !== 10}>
            Сформировать команды
          </Button>
            </div>
          ) : (
            <div className="space-y-4">
          <p className="text-sm text-[var(--text-3)]">
            Ученикам уйдёт сообщение с кнопками «Я играю» / «Не играю». Первые 10 — в состав,
            остальные в очередь. С Telegram: {withTelegram.length} из {onlyStudents.length}.
            Сами вы записываетесь кнопкой «Я тоже играю» в карточке игры.
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
            <p className="mt-1 text-xs text-[var(--text-3)]">
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
            <Label>Кому отправить</Label>
            <div className="mt-2">
              <RecipientPicker
                students={pickerStudents}
                groups={groups}
                value={inviteIds}
                onChange={setInviteIds}
                requireTelegram
              />
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
              {forSeries ? "Всем участникам" : "Всем с Telegram"} ({withTelegram.length})
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => createOpenSignup(false, true)}
              disabled={!openDate || creatingOpen}
              title="Отправить себе превью опроса в Telegram"
            >
              Превью себе
            </Button>
          </div>
            </div>
          )}
        </div>
      </CollapsibleCard>

      {(() => {
        const renderSession = (session: (typeof sessions)[number]) => {
        // Сила игроков этой сессии — замороженная при сборке составов (lib/match-power.ts):
        // все суммы, названия команд и цифры ниже берут её, а не текущий профиль
        const studentMap = withFrozenPower(allStudentsMap, session.powerSnapshot);
        const powerFrozen = Object.keys(parsePowerSnapshot(session.powerSnapshot)).length > 0;
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
        // Отказ тренера не показываем: он записывается своей кнопкой «Я тоже играю»
        const declined = rsvps.filter(
          (r) => (r.status === "DECLINED" || r.status === "REMOVED") && r.userId !== coachId
        );
        const invited = rsvps.filter((r) => r.status === "INVITED");
        const isOpen = session.mode === "OPEN_SIGNUP";
        const radiantPower = sumPower(radiantLineup, studentMap);
        const direPower = sumPower(direLineup, studentMap);
        const powerDiff = Math.abs(radiantPower - direPower);

        return (
          <SessionShell
            key={session.id}
            collapsible={session.status === "COMPLETED"}
            title={formatDate(session.date)}
            summary={(() => {
              const ratingById = Object.fromEntries(
                Object.entries(studentMap).map(([id, s]) => [id, s.profile?.finalRating ?? 0])
              );
              const sc = seriesScoreByGame1Roster(session, ratingById);
              return session.games.length
                ? `${radiantName.replace(/^Team\s+/i, "")} ${sc.radiantWins}:${sc.direWins} ${direName.replace(/^Team\s+/i, "")}`
                : null;
            })()}
            header={
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>{formatDate(session.date)}</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="admin">
                    {MATCH_MODE_LABELS[session.mode] ?? session.mode}
                  </Badge>
                  {session.series && <Badge variant="points">«{session.series.name}»</Badge>}
                  <Badge>{MATCH_STATUS_LABELS[session.status]}</Badge>
                  {canEdit && !isEditing && (
                    <>
                      {canEditGame1 && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => startEdit(session, 1)}
                        >
                          Перетащить №1
                        </Button>
                      )}
                      {canEditGame2 && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => startEdit(session, 2)}
                        >
                          Перетащить №2
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
            }
          >

              {isOpen && beforeStart && (
                <div className="space-y-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--control)] p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-[var(--text)]">
                      Запись: {joined.length}/10 в составе · очередь {queued.length} · ждут{" "}
                      {invited.length}
                    </p>
                    {/* Тренер сам записывается в игру или выходит из неё */}
                    {joined.some((r) => r.userId === coachId) || queued.some((r) => r.userId === coachId) ? (
                      <Button size="sm" variant="outline" disabled={coachBusy} onClick={() => coachSignup(session.id, false)}>
                        Я не играю
                      </Button>
                    ) : (
                      <Button size="sm" disabled={coachBusy} onClick={() => coachSignup(session.id, true)}>
                        Я тоже играю
                      </Button>
                    )}
                  </div>
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
                    Перетащите игрока на другую роль или в другую команду — места поменяются.
                    Можно и выбрать из списка.
                  </p>
                  <DraggableLineupEditor
                    radiantTitle={radiantName}
                    direTitle={direName}
                    radiant={draftRadiant}
                    dire={draftDire}
                    map={studentMap}
                    onSwapSlots={swapSlots}
                    onAssign={assignPlayer}
                  />
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
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 [&>*]:min-w-0">
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
                        <span className="text-[var(--text-3)]">
                          {" "}
                          ({radiantPower > direPower ? radiantName : direName} сильнее)
                        </span>
                      )}
                    </p>
                    {powerFrozen && session.status !== "COMPLETED" && (
                      <p className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-3)]">
                        🔒 Сила зафиксирована при сборке составов — до конца игр она не меняется,
                        даже если ученик поменяет ранг или получит новые оценки.
                        {beforeStart && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={saving}
                            onClick={() => refreshPower(session.id)}
                          >
                            Обновить силу из профилей
                          </Button>
                        )}
                      </p>
                    )}
                  </div>
                )
              )}

              {session.status === "TEAMS_SET" && !isEditing && (
                <div className="space-y-2">
                  {!hasGame2 && intensityControl()}
                  <div className="flex flex-wrap items-center gap-2">
                    {hasGame2 ? (
                      <Button onClick={() => confirmLineups(session.id)} disabled={saving}>
                        Утвердить составы (игры 1 и 2)
                      </Button>
                    ) : (
                      // Одна игра за день — 2-й состав не нужен
                      <Button onClick={() => confirmLineups(session.id, true)} disabled={saving}>
                        Утвердить 1-й состав (одна игра)
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      disabled={saving}
                      onClick={() => rebalanceGame1(session.id)}
                    >
                      Пересобрать 1-й состав
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={saving}
                      onClick={() => generateGame2(session.id)}
                    >
                      {hasGame2 ? "Пересобрать 2-й состав" : "Собрать состав на 2-ю игру"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        completeSession(session.id, { cancelWithoutGames: true })
                      }
                    >
                      Отменить / завершить без игр
                    </Button>
                  </div>
                  {!hasGame2 && (
                    <p className="text-xs text-[var(--text-3)]">
                      Одна игра — утвердите 1-й состав. Две игры — сначала соберите состав на 2-ю,
                      тогда игрокам уйдёт одно сообщение с обоими составами.
                    </p>
                  )}
                </div>
              )}

              {hasGame2 &&
                !isEditing &&
                (session.status === "LINEUPS_CONFIRMED" ||
                  session.status === "IN_PROGRESS" ||
                  session.status === "TEAMS_SET" ||
                  session.status === "COMPLETED") && (
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
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 [&>*]:min-w-0">
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
                        <span className="text-[var(--text-3)]">
                          {" "}
                          (
                          {game2RadiantPower > game2DirePower
                            ? game2RadiantName
                            : game2DireName}{" "}
                          сильнее)
                        </span>
                      )}
                    </p>
                    {session.status !== "COMPLETED" && (
                      <>
                        <p className="text-xs text-[var(--text-3)]">
                          Пересборка с учётом позиций, ролей и баланса силы. Победа в
                          обеих играх за день: +2 за вторую подряд + 0/0.1/0.2/0.5 за
                          роль.
                        </p>
                        <div className="space-y-2">
                          {intensityControl()}
                          <div className="flex flex-wrap items-center gap-2">
                            {session.status === "TEAMS_SET" && !session.lineupsGame2Confirmed && (
                              <Button
                                disabled={saving}
                                onClick={() => confirmLineups(session.id)}
                              >
                                Утвердить составы (игры 1 и 2)
                              </Button>
                            )}
                            {session.status === "LINEUPS_CONFIRMED" &&
                              !session.lineupsGame2Confirmed && (
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
                      </>
                    )}
                  </div>
                )}

              {session.status === "LINEUPS_CONFIRMED" && !isEditing && (
                <div className="space-y-2">
                  {!hasGame2 && intensityControl()}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={() => startSession(session.id)}>
                      Старт сессии (все за ПК)
                    </Button>
                    {session.seriesId ? null : session.predictionsOpen ? (
                      <Badge variant="success" className="self-center h-11 px-3.5 text-[13px]">
                        Прогнозы открыты · закроются при старте
                      </Badge>
                    ) : (
                      <Button
                        variant="secondary"
                        disabled={saving || (hasGame2 && !session.lineupsGame2Confirmed)}
                        title={
                          hasGame2 && !session.lineupsGame2Confirmed
                            ? "Сначала утвердите состав на игру №2"
                            : "Ученики смогут сделать прогноз на сайте и в Telegram"
                        }
                        onClick={() => openPredictions(session.id)}
                      >
                        Открыть прогнозы
                      </Button>
                    )}
                    {!hasGame2 && (
                      <Button
                        variant="secondary"
                        disabled={saving}
                        onClick={() => generateGame2(session.id)}
                      >
                        Собрать состав на 2-ю игру
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={() =>
                        completeSession(session.id, { cancelWithoutGames: true })
                      }
                    >
                      Отменить / завершить без игр
                    </Button>
                  </div>
                </div>
              )}

              {session.predictionsOpen && !isEditing && (session.predictions?.length ?? 0) >= 0 && (
                <div className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                  <p className="mb-3 font-display text-base font-semibold text-[var(--text)]">
                    Прогнозы учеников
                    {(session.predictions?.length ?? 0) === 0 && (
                      <span className="ml-2 text-[13px] font-normal text-[var(--text-3)]">
                        пока никто не проголосовал
                      </span>
                    )}
                  </p>
                  <div className="grid gap-4 min-[720px]:grid-cols-2">
                    {[1, ...(hasGame2 ? [2] : [])].map((gameNumber) => {
                      const names =
                        gameNumber === 1
                          ? { RADIANT: radiantName, DIRE: direName }
                          : { RADIANT: game2RadiantName, DIRE: game2DireName };
                      const forGame = (session.predictions ?? []).filter(
                        (p) => p.gameNumber === gameNumber
                      );
                      const winner = session.games.find((g) => g.gameNumber === gameNumber)?.winnerTeam;
                      const bySide = {
                        RADIANT: forGame.filter((p) => p.pick === "RADIANT"),
                        DIRE: forGame.filter((p) => p.pick === "DIRE"),
                      } as const;
                      return (
                        <div key={gameNumber} className="space-y-2">
                          <p className="text-[13px] font-medium text-[var(--text-2)]">
                            Игра №{gameNumber}
                            <span className="ml-2 font-mono-num text-[12px] text-[var(--text-3)]">
                              {forGame.length} голос{forGame.length === 1 ? "" : forGame.length < 5 ? "а" : "ов"}
                            </span>
                            {winner && (
                              <span className="ml-2 text-[12px] font-semibold text-[var(--success-ink)]">
                                победил {names[winner as "RADIANT" | "DIRE"] ?? winner}
                              </span>
                            )}
                          </p>
                          {(["RADIANT", "DIRE"] as const).map((side) => (
                            <div
                              key={side}
                              className="rounded-[var(--radius-control)] border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2"
                            >
                              <p className="mb-1.5 flex items-center justify-between gap-2 text-[12px] font-semibold text-[var(--text)]">
                                <span className="min-w-0 truncate">{names[side]}</span>
                                <span className="font-mono-num text-[var(--text-3)]">
                                  {bySide[side].length}
                                </span>
                              </p>
                              {bySide[side].length === 0 ? (
                                <p className="text-[12px] text-[var(--text-3)]">—</p>
                              ) : (
                                <ul className="space-y-0.5 text-[13px]">
                                  {bySide[side].map((p) => {
                                    const correct = winner != null && p.pick === winner;
                                    const wrong = winner != null && p.pick !== winner;
                                    return (
                                      <li
                                        key={p.id}
                                        className={
                                          correct
                                            ? "font-medium text-[var(--success-ink)]"
                                            : wrong
                                              ? "text-[var(--danger)]"
                                              : "text-[var(--text-2)]"
                                        }
                                      >
                                        {displayName(p.user)}
                                        {correct ? " ✓" : wrong ? " ✗" : ""}
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                  {session.status === "COMPLETED" &&
                    (() => {
                      const predGames = [1, ...(hasGame2 ? [2] : [])];
                      const users = [
                        ...new Set((session.predictions ?? []).map((p) => p.userId)),
                      ];
                      const dayCorrect = users.filter((uid) =>
                        predGames.every((g) => {
                          const pr = (session.predictions ?? []).find(
                            (p) => p.userId === uid && p.gameNumber === g
                          );
                          const res = session.games.find((x) => x.gameNumber === g);
                          return pr && res && res.winnerTeam === pr.pick;
                        })
                      );
                      if (users.length === 0) return null;
                      return (
                        <div className="mt-4 rounded-[var(--radius-control)] border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2.5">
                          <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--text-3)]">
                            Итог дня · угадали все игры
                          </p>
                          <p className="mt-1 text-[13px] font-medium text-[var(--success-ink)]">
                            {dayCorrect.length
                              ? dayCorrect
                                  .map((id) => {
                                    const row = (session.predictions ?? []).find(
                                      (p) => p.userId === id
                                    );
                                    return row ? displayName(row.user) : id;
                                  })
                                  .join(", ")
                              : "Никто не угадал все игры"}
                            <span className="ml-2 font-normal text-[var(--text-3)]">
                              ({dayCorrect.length}/{users.length})
                            </span>
                          </p>
                        </div>
                      );
                    })()}
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
                      className="h-auto min-h-[46px] max-w-full whitespace-normal py-2 text-left min-[720px]:min-h-11"
                      onClick={() =>
                        recordResult(session.id, "RADIANT", nextGameNumber)
                      }
                    >
                      Победа {activeWinRadiantName}
                    </Button>
                    <Button
                      variant="secondary"
                      className="h-auto min-h-[46px] max-w-full whitespace-normal py-2 text-left min-[720px]:min-h-11"
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
                    <Button variant="outline" onClick={() => completeSession(session.id)}>
                      Завершить сессию
                    </Button>
                  </div>
                </div>
              )}

              {(session.status === "COMPLETED" ||
                session.mvpResolved ||
                (session.mvpVotes && session.mvpVotes.length > 0)) &&
                !isEditing && (
                  <div className="space-y-2 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--control)] p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-[var(--text)]">
                        MVP дня{" "}
                        {session.mvpResolved
                          ? session.mvpWinnerId
                            ? `(закрыто, победитель: ${displayName(
                                studentMap[session.mvpWinnerId] ?? {
                                  firstName: "?",
                                }
                              )})`
                            : "(закрыто, ничья)"
                          : session.status === "COMPLETED"
                            ? "(голосование)"
                            : "(откроется после «Завершить сессию»)"}
                      </p>
                      {!session.mvpResolved && session.status === "COMPLETED" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => sendMvpInvites(session.id)}
                        >
                          MVP: опрос в TG ещё раз
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-[var(--text-3)]">
                      Ученикам: топ-3 по голосам + кто проголосовал. Здесь ещё — кто за
                      кого.
                    </p>
                    {(session.mvpVotes?.length ?? 0) === 0 ? (
                      <p className="text-xs text-[var(--text-3)]">Пока нет голосов.</p>
                    ) : (
                      <>
                        <div className="text-xs text-[var(--text-2)]">
                          <p className="font-medium text-[var(--text)]">Топ-3</p>
                          {(() => {
                            const counts = new Map<string, number>();
                            for (const v of session.mvpVotes!) {
                              counts.set(
                                v.nomineeId,
                                (counts.get(v.nomineeId) ?? 0) + 1
                              );
                            }
                            const medals = ["🥇", "🥈", "🥉"];
                            return [...counts.entries()]
                              .sort((a, b) => b[1] - a[1])
                              .slice(0, 3)
                              .map(([id, n], i) => (
                                <p key={id}>
                                  {medals[i]}{" "}
                                  {displayName(
                                    studentMap[id] ?? { firstName: "?" }
                                  )}{" "}
                                  — <b>{n}</b>
                                </p>
                              ));
                          })()}
                        </div>
                        <ul className="space-y-1 text-xs text-[var(--text-2)]">
                          {session.mvpVotes!.map((v) => (
                            <li key={v.id}>
                              {displayName(v.voter)} → {displayName(v.nominee)}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    {(() => {
                      const voted = new Set(
                        (session.mvpVotes ?? []).map((v) => v.voterId)
                      );
                      const all = [...radiantIds, ...direIds];
                      const pending = all.filter((id) => !voted.has(id));
                      if (!pending.length || session.mvpResolved) return null;
                      return (
                        <p className="text-xs text-[var(--text-3)]">
                          Ещё не голосовали:{" "}
                          {pending
                            .map((id) =>
                              displayName(studentMap[id] ?? { firstName: id })
                            )
                            .join(", ")}
                        </p>
                      );
                    })()}
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
              {session.games.length > 0 && (
                <ReplayUploads
                  sessionId={session.id}
                  games={[...new Set(session.games.map((g) => g.gameNumber))].sort((a, b) => a - b)}
                  replays={session.replays ?? []}
                />
              )}
          </SessionShell>
        );
        };
        const active = sessions.filter((x) => x.status !== "COMPLETED");
        const done = sessions.filter((x) => x.status === "COMPLETED");
        return (
          <>
            {active.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-[17px] min-[720px]:text-[20px]">Текущие</h2>
                {active.map(renderSession)}
              </section>
            )}
            {done.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-baseline gap-2">
                  <h2 className="text-[17px] min-[720px]:text-[20px]">Архив</h2>
                  <span className="font-mono-num text-[13px] text-[var(--text-3)]">{done.length}</span>
                </div>
                {done.map(renderSession)}
              </section>
            )}
          </>
        );
      })()}
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
      <p className="mb-1 text-xs uppercase tracking-wide text-[var(--text-3)]">{title}</p>
      <ul className="space-y-1">
        {items.map((r, idx) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2">
            {showQueueIndex && (
              <span className="font-mono-num text-xs text-[var(--text-3)]">#{idx + 1}</span>
            )}
            <PlayerLink user={r.user} className="inline" />
            <span className="text-xs text-[var(--text-3)]">
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

/** Копия карточек игроков, где сила заменена замороженной для сессии */
function withFrozenPower(
  map: Record<string, Student>,
  snapshotRaw: string | null | undefined
): Record<string, Student> {
  const frozen = parsePowerSnapshot(snapshotRaw);
  const ids = Object.keys(frozen);
  if (!ids.length) return map;
  const out = { ...map };
  for (const id of ids) {
    const s = out[id];
    if (s?.profile) out[id] = { ...s, profile: { ...s.profile, finalRating: frozen[id] } };
  }
  return out;
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
    <div className="min-w-0 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate font-semibold text-[var(--text)]">{title}</p>
        <span className="font-mono-num text-xs text-[var(--text-3)]">
          Σ сила {teamPower}
        </span>
      </div>
      <ul className="divide-y divide-[var(--border-soft)] text-sm">
        {lineup.map((slot) => {
          const student = map[slot.userId];
          const power = student?.profile?.finalRating ?? 0;
          return (
            <li key={`${slot.team}-${slot.position}`} className="flex items-center gap-2 py-1.5">
              <PositionBadge position={slot.position} title={POSITION_LABELS[slot.position]} />
              <span className="min-w-0 flex-1">
                {student ? <PlayerLink user={student} avatar={24} /> : slot.userId}
              </span>
              <span className="hidden shrink-0 items-center min-[1100px]:inline-flex">
                <PlayerRolesDisplay profile={student?.profile} />
              </span>
              <PowerPill value={power} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function slotDragId(team: "RADIANT" | "DIRE", position: number) {
  return `${team}:${position}`;
}

function parseSlotDragId(id: string): { team: "RADIANT" | "DIRE"; position: number } | null {
  const [team, pos] = id.split(":");
  if (team !== "RADIANT" && team !== "DIRE") return null;
  const position = Number(pos);
  if (!Number.isFinite(position) || position < 1 || position > 5) return null;
  return { team, position };
}

function SortablePlayerSlot({
  team,
  position,
  userId,
  pool,
  map,
  onAssign,
}: {
  team: "RADIANT" | "DIRE";
  position: number;
  userId: string;
  pool: DraftSlot[];
  map: Record<string, Student>;
  onAssign: (team: "RADIANT" | "DIRE", position: number, userId: string) => void;
}) {
  const id = slotDragId(team, position);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const student = map[userId];
  const power = student?.profile?.finalRating ?? 0;
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? "transform 160ms cubic-bezier(0.23, 1, 0.32, 1)",
    opacity: isDragging ? 0.45 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex flex-col gap-1.5 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] p-2"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex h-9 w-8 shrink-0 touch-manipulation cursor-grab items-center justify-center rounded border border-[var(--border)] bg-[var(--control)] text-[var(--text-3)] active:cursor-grabbing active:scale-[0.97]"
          aria-label="Перетащить"
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </button>
        <span className="inline-flex h-7 min-w-[4.5rem] shrink-0 items-center justify-center rounded border border-[var(--border)] bg-[var(--control)] px-1.5 font-mono-num text-[11px] text-[var(--text-2)]">
          {POSITION_LABELS[position] ?? `поз. ${position}`}
        </span>
        <select
          className="flex h-9 min-w-0 flex-1 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)]"
          value={userId}
          onChange={(e) => {
            if (e.target.value) onAssign(team, position, e.target.value);
          }}
        >
          {pool.map((p) => (
            <option key={p.userId} value={p.userId}>
              {map[p.userId] ? displayName(map[p.userId]) : p.userId}
            </option>
          ))}
        </select>
        <PowerPill value={power} />
      </div>
      <PlayerRolesDisplay profile={student?.profile} className="pl-10" />
    </li>
  );
}

function DraggableLineupEditor({
  radiantTitle,
  direTitle,
  radiant,
  dire,
  map,
  onSwapSlots,
  onAssign,
}: {
  radiantTitle: string;
  direTitle: string;
  radiant: DraftSlot[];
  dire: DraftSlot[];
  map: Record<string, Student>;
  onSwapSlots: (
    fromTeam: "RADIANT" | "DIRE",
    fromPos: number,
    toTeam: "RADIANT" | "DIRE",
    toPos: number
  ) => void;
  onAssign: (team: "RADIANT" | "DIRE", position: number, userId: string) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } })
  );
  const pool = [...radiant, ...dire];
  const radiantByPos = Object.fromEntries(radiant.map((s) => [s.position, s]));
  const direByPos = Object.fromEntries(dire.map((s) => [s.position, s]));
  const itemIds = [
    ...[1, 2, 3, 4, 5].map((p) => slotDragId("RADIANT", p)),
    ...[1, 2, 3, 4, 5].map((p) => slotDragId("DIRE", p)),
  ];

  const activeParsed = activeId ? parseSlotDragId(activeId) : null;
  const activeSlot =
    activeParsed &&
    (activeParsed.team === "RADIANT"
      ? radiantByPos[activeParsed.position]
      : direByPos[activeParsed.position]);

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = parseSlotDragId(String(active.id));
    const to = parseSlotDragId(String(over.id));
    if (!from || !to) return;
    onSwapSlots(from.team, from.position, to.team, to.position);
  }

  function teamCol(
    title: string,
    team: "RADIANT" | "DIRE",
    byPos: Record<number, DraftSlot>
  ) {
    return (
      <div className="rounded-[var(--radius-control)] border border-[var(--admin-border)] bg-[var(--admin-bg)] p-3">
        <p className="mb-2 font-semibold text-[var(--admin)]">{title}</p>
        <ul className="space-y-2">
          {[1, 2, 3, 4, 5].map((pos) => (
            <SortablePlayerSlot
              key={slotDragId(team, pos)}
              team={team}
              position={pos}
              userId={byPos[pos]?.userId ?? ""}
              pool={pool}
              map={map}
              onAssign={onAssign}
            />
          ))}
        </ul>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div className="grid gap-4 md:grid-cols-2">
          {teamCol(radiantTitle, "RADIANT", radiantByPos)}
          {teamCol(direTitle, "DIRE", direByPos)}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeSlot && activeParsed ? (
          <div className="rounded-[var(--radius-control)] border border-[var(--points-border)] bg-[var(--surface)] px-3 py-2 shadow-[var(--shadow-popover)]">
            <span className="font-mono-num text-[12px] text-[var(--text-3)]">
              {POSITION_LABELS[activeParsed.position]}
            </span>{" "}
            <span className="text-sm font-medium text-[var(--text)]">
              {map[activeSlot.userId]
                ? displayName(map[activeSlot.userId])
                : activeSlot.userId}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/** Карточка сессии: текущие раскрыты, завершённые свёрнуты в строку со счётом */
function SessionShell({
  collapsible,
  title,
  summary,
  header,
  children,
}: {
  collapsible: boolean;
  title: string;
  summary?: string | null;
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  if (collapsible) {
    return (
      <CollapsibleCard title={title} description={summary ?? "Без результата"}>
        <div className="space-y-4">
          <div className="flex flex-wrap justify-end gap-2">{header}</div>
          {children}
        </div>
      </CollapsibleCard>
    );
  }
  return (
    <Card>
      <CardHeader>{header}</CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}
