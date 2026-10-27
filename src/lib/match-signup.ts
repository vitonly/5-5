import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PLAYER_ROLES } from "@/lib/coach";
import { balanceTeams } from "@/lib/team-balance";
import { parseSecondaryRoles } from "@/lib/secondary-roles";
import { displayName, formatDate, parseJsonArray, toJsonArray } from "@/lib/utils";
import { POSITION_LABELS } from "@/lib/labels";
import {
  answerCallbackQuery,
  editTelegramInviteMessage,
  notifyChatId,
  sendTelegramInviteDetailed,
  sendTelegramMessage,
  type InlineKeyboard,
} from "@/lib/telegram";
import type { TeamAssignment } from "@/lib/match-lineup";

const OPEN_SLOTS = 10;

function hasInvitePhoto(session: { inviteImageUrl?: string | null }) {
  return Boolean(session.inviteImageUrl);
}

function signupKeyboard(sessionId: string): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "✅ Я играю", callback_data: `m5:${sessionId}:y` },
        { text: "❌ Не играю", callback_data: `m5:${sessionId}:n` },
      ],
    ],
  };
}

function buildAssignmentsJson(
  teams: ReturnType<typeof balanceTeams>
): string {
  const map: TeamAssignment = {};
  for (const p of teams.radiant) {
    map[p.id] = { team: "RADIANT", position: p.position };
  }
  for (const p of teams.dire) {
    map[p.id] = { team: "DIRE", position: p.position };
  }
  return JSON.stringify(map);
}

async function loadBalancePlayers(userIds: string[]) {
  const profiles = await prisma.playerProfile.findMany({
    where: { userId: { in: userIds } },
    include: { user: true },
  });
  return profiles.map((p) => ({
    id: p.userId,
    name: displayName(p.user),
    finalRating: p.finalRating,
    primaryRole: p.primaryRole,
    secondaryRoles: parseSecondaryRoles(p.secondaryRoles, p.secondaryRole),
  }));
}

/** Пересобрать команды из текущих JOINED (ровно 10). По умолчанию — строго по ролям из профиля. */
export async function rebalanceOpenSession(
  sessionId: string,
  onlyListedRoles: boolean = true
) {
  const joined = await prisma.matchRsvp.findMany({
    where: { sessionId, status: "JOINED" },
    orderBy: { respondedAt: "asc" },
  });

  if (joined.length !== OPEN_SLOTS) {
    await prisma.matchSession.update({
      where: { id: sessionId },
      data: {
        status: "PLANNED",
        radiantPlayerIds: "[]",
        direPlayerIds: "[]",
        teamAssignments: "{}",
      },
    });
    return null;
  }

  const players = await loadBalancePlayers(joined.map((r) => r.userId));
  if (players.length !== OPEN_SLOTS) {
    throw new Error("Не у всех игроков есть профиль");
  }

  try {
    const teams = balanceTeams(players, onlyListedRoles);
    const updated = await prisma.matchSession.update({
      where: { id: sessionId },
      data: {
        status: "TEAMS_SET",
        radiantPlayerIds: toJsonArray(teams.radiant.map((p) => p.id)),
        direPlayerIds: toJsonArray(teams.dire.map((p) => p.id)),
        teamAssignments: buildAssignmentsJson(teams),
        teamAssignmentsGame2: "{}",
        lineupsGame2Confirmed: false,
      },
    });
    return { session: updated, teams };
  } catch (e) {
    // 10 записаны, но строго по ролям нельзя — оставляем без автосостава
    await prisma.matchSession.update({
      where: { id: sessionId },
      data: {
        status: "PLANNED",
        radiantPlayerIds: "[]",
        direPlayerIds: "[]",
        teamAssignments: "{}",
        teamAssignmentsGame2: "{}",
        lineupsGame2Confirmed: false,
      },
    });
    console.error("[rebalanceOpenSession]", e);
    return null;
  }
}

/** Одно TG-сообщение с составами на игру №1 и №2 */
async function notifyBothLineupsConfirmed(sessionId: string) {
  const session = await prisma.matchSession.findUnique({ where: { id: sessionId } });
  if (!session) return;

  const a1 = parseAssignmentsSafe(session.teamAssignments);
  const a2 = parseAssignmentsSafe(session.teamAssignmentsGame2);
  const radiant1 = Object.entries(a1)
    .filter(([, a]) => a.team === "RADIANT")
    .sort((x, y) => x[1].position - y[1].position)
    .map(([id]) => id);
  const dire1 = Object.entries(a1)
    .filter(([, a]) => a.team === "DIRE")
    .sort((x, y) => x[1].position - y[1].position)
    .map(([id]) => id);
  const radiant2 = Object.entries(a2)
    .filter(([, a]) => a.team === "RADIANT")
    .sort((x, y) => x[1].position - y[1].position)
    .map(([id]) => id);
  const dire2 = Object.entries(a2)
    .filter(([, a]) => a.team === "DIRE")
    .sort((x, y) => x[1].position - y[1].position)
    .map(([id]) => id);
  const allIds = [...new Set([...radiant1, ...dire1, ...radiant2, ...dire2])];
  if (radiant1.length !== 5 || dire1.length !== 5 || radiant2.length !== 5 || dire2.length !== 5) return;

  const [users, profiles, rsvps] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: allIds } } }),
    prisma.playerProfile.findMany({
      where: { userId: { in: allIds } },
      select: { userId: true, finalRating: true },
    }),
    prisma.matchRsvp.findMany({ where: { sessionId, userId: { in: allIds } } }),
  ]);
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
  const powerMap = Object.fromEntries(profiles.map((p) => [p.userId, p.finalRating]));
  const rsvpMap = Object.fromEntries(rsvps.map((r) => [r.userId, r]));

  const { teamDisplayName } = await import("@/lib/team-names");
  const named = (ids: string[]) =>
    ids.map((id) => ({
      id,
      firstName: userMap[id]?.firstName,
      lastName: userMap[id]?.lastName,
      username: userMap[id]?.username,
      finalRating: powerMap[id] ?? 0,
    }));
  const r1Name = teamDisplayName(named(radiant1), "Team A");
  const d1Name = teamDisplayName(named(dire1), "Team B");
  const r2Name = teamDisplayName(named(radiant2), "Team A");
  const d2Name = teamDisplayName(named(dire2), "Team B");

  const lineFor = (ids: string[], assign: TeamAssignment) =>
    ids
      .map((id) => {
        const pos = assign[id]?.position;
        const name = userMap[id] ? displayName(userMap[id]) : id;
        return `  ${pos ? POSITION_LABELS[pos] ?? pos : "?"}: ${name}`;
      })
      .join("\n");

  // Одна игра за день — в сообщении только состав на игру №1
  const singleGame = radiant2.length + dire2.length === 0;
  const game1Block = `<b>Игра №1</b>\n<b>${r1Name}</b>\n${lineFor(radiant1, a1)}\n\n<b>${d1Name}</b>\n${lineFor(dire1, a1)}`;
  const body = singleGame
    ? `⚔️ <b>Состав утверждён</b>\n${formatDate(session.date)}\n\n${game1Block}`
    : `⚔️ <b>Составы утверждены</b>\n${formatDate(session.date)}\n\n${game1Block}\n\n` +
      `<b>Игра №2</b>\n<b>${r2Name}</b>\n${lineFor(radiant2, a2)}\n\n<b>${d2Name}</b>\n${lineFor(dire2, a2)}`;

  for (const userId of allIds) {
    const user = userMap[userId];
    if (!user) continue;
    const s1 = a1[userId]?.team === "DIRE" ? d1Name : r1Name;
    const p1 = a1[userId]?.position ? POSITION_LABELS[a1[userId].position] ?? String(a1[userId].position) : "?";
    const s2 = a2[userId]?.team === "DIRE" ? d2Name : r2Name;
    const p2 = a2[userId]?.position ? POSITION_LABELS[a2[userId].position] ?? String(a2[userId].position) : "?";
    const text = singleGame
      ? `${body}\n\nВы: <b>${s1}</b>, ${p1}`
      : `${body}\n\nВы · игра 1: <b>${s1}</b>, ${p1}\nВы · игра 2: <b>${s2}</b>, ${p2}`;
    const rsvp = rsvpMap[userId];
    const chatId = rsvp?.tgChatId || notifyChatId(user);
    if (rsvp?.tgMessageId && chatId) {
      await editTelegramInviteMessage(chatId, rsvp.tgMessageId, text, null, hasInvitePhoto(session));
    } else if (chatId) {
      await sendTelegramMessage(chatId, text);
    }
  }
  await refreshQueueMessages(sessionId);
}

function parseAssignmentsSafe(raw: string | null | undefined): TeamAssignment {
  try {
    return JSON.parse(raw || "{}") as TeamAssignment;
  } catch {
    return {};
  }
}

export function game2LineupComplete(teamAssignmentsGame2: string | null | undefined): boolean {
  try {
    const g2 = JSON.parse(teamAssignmentsGame2 || "{}") as TeamAssignment;
    const r2 = Object.values(g2).filter((a) => a.team === "RADIANT").length;
    const d2 = Object.values(g2).filter((a) => a.team === "DIRE").length;
    return r2 === 5 && d2 === 5;
  } catch {
    return false;
  }
}

/** Уведомить игроков о составе на игру №2 */
async function notifyTeamsFormedGame2(sessionId: string) {
  const session = await prisma.matchSession.findUnique({ where: { id: sessionId } });
  if (!session) return;

  let assignment: TeamAssignment = {};
  try {
    assignment = JSON.parse(session.teamAssignmentsGame2 || "{}") as TeamAssignment;
  } catch {
    return;
  }
  const radiantIds = Object.entries(assignment)
    .filter(([, a]) => a.team === "RADIANT")
    .sort((a, b) => a[1].position - b[1].position)
    .map(([id]) => id);
  const direIds = Object.entries(assignment)
    .filter(([, a]) => a.team === "DIRE")
    .sort((a, b) => a[1].position - b[1].position)
    .map(([id]) => id);
  const allIds = [...radiantIds, ...direIds];
  if (allIds.length !== OPEN_SLOTS) return;

  const [users, profiles, rsvps] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: allIds } } }),
    prisma.playerProfile.findMany({
      where: { userId: { in: allIds } },
      select: { userId: true, finalRating: true },
    }),
    prisma.matchRsvp.findMany({
      where: { sessionId, userId: { in: allIds } },
    }),
  ]);

  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
  const powerMap = Object.fromEntries(profiles.map((p) => [p.userId, p.finalRating]));
  const rsvpMap = Object.fromEntries(rsvps.map((r) => [r.userId, r]));

  const { teamDisplayName } = await import("@/lib/team-names");
  const named = (ids: string[]) =>
    ids.map((id) => ({
      id,
      firstName: userMap[id]?.firstName,
      lastName: userMap[id]?.lastName,
      username: userMap[id]?.username,
      finalRating: powerMap[id] ?? 0,
    }));
  const radiantName = teamDisplayName(named(radiantIds), "Team A");
  const direName = teamDisplayName(named(direIds), "Team B");

  const lineFor = (ids: string[]) =>
    ids
      .map((id) => {
        const pos = assignment[id]?.position;
        const name = userMap[id] ? displayName(userMap[id]) : id;
        return `  ${pos ? POSITION_LABELS[pos] ?? pos : "?"}: ${name}`;
      })
      .join("\n");

  const header = `⚔️ <b>Состав на игру №2 утверждён</b>\n${formatDate(session.date)}\n\nМинимальный свап команд.\n\n<b>${radiantName}</b>\n${lineFor(radiantIds)}\n\n<b>${direName}</b>\n${lineFor(direIds)}`;

  for (const userId of allIds) {
    const user = userMap[userId];
    if (!user) continue;
    const a = assignment[userId];
    const side = a?.team === "DIRE" ? direName : radiantName;
    const pos = a?.position ? POSITION_LABELS[a.position] ?? String(a.position) : "?";
    const text = `${header}\n\nВы: <b>${side}</b>, ${pos}`;
    const rsvp = rsvpMap[userId];
    const chatId = rsvp?.tgChatId || notifyChatId(user);
    if (!chatId) continue;
    await sendTelegramMessage(chatId, text);
  }
}

/**
 * Утвердить оба состава разом: одно TG всем игрокам, дальше можно стартовать.
 * singleGame — за день будет одна игра: утверждаем только 1-й состав
 * (2-й, если всё-таки понадобится, можно собрать и утвердить позже отдельно).
 */
export async function confirmLineups(sessionId: string, opts: { singleGame?: boolean } = {}) {
  const session = await prisma.matchSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new Error("Сессия не найдена");
  if (session.status === "LINEUPS_CONFIRMED") {
    throw new Error("Составы уже утверждены");
  }
  if (session.status === "IN_PROGRESS" || session.status === "COMPLETED") {
    throw new Error("Сессия уже начата или завершена");
  }
  if (session.status !== "TEAMS_SET") {
    throw new Error("Сначала нужен полный состав (10 игроков)");
  }

  const radiantIds = parseJsonArray(session.radiantPlayerIds);
  const direIds = parseJsonArray(session.direPlayerIds);
  if (radiantIds.length !== 5 || direIds.length !== 5) {
    throw new Error("В каждой команде должно быть 5 игроков");
  }
  const singleGame = Boolean(opts.singleGame);
  if (!singleGame && !game2LineupComplete(session.teamAssignmentsGame2)) {
    throw new Error("Сначала соберите состав на 2-ю игру — или утвердите только 1-й (одна игра)");
  }

  const updated = await prisma.matchSession.update({
    where: { id: sessionId },
    data: singleGame
      ? // Черновик 2-го состава убираем: игрокам уйдёт только состав на игру №1
        { status: "LINEUPS_CONFIRMED", lineupsGame2Confirmed: false, teamAssignmentsGame2: "{}" }
      : { status: "LINEUPS_CONFIRMED", lineupsGame2Confirmed: true },
  });

  await notifyBothLineupsConfirmed(sessionId);
  return updated;
}

/** Утвердить состав на игру №2 и разослать в Telegram. */
export async function confirmLineupsGame2(sessionId: string) {
  const session = await prisma.matchSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new Error("Сессия не найдена");
  if (session.lineupsGame2Confirmed) {
    throw new Error("Состав на 2-ю игру уже утверждён");
  }
  let assignment: TeamAssignment = {};
  try {
    assignment = JSON.parse(session.teamAssignmentsGame2 || "{}") as TeamAssignment;
  } catch {
    throw new Error("Сначала соберите состав на 2-ю игру");
  }
  const radiantIds = Object.entries(assignment)
    .filter(([, a]) => a.team === "RADIANT")
    .map(([id]) => id);
  const direIds = Object.entries(assignment)
    .filter(([, a]) => a.team === "DIRE")
    .map(([id]) => id);
  if (radiantIds.length !== 5 || direIds.length !== 5) {
    throw new Error("Сначала соберите полный состав на 2-ю игру (10 игроков)");
  }

  const updated = await prisma.matchSession.update({
    where: { id: sessionId },
    data: { lineupsGame2Confirmed: true },
  });

  await notifyTeamsFormedGame2(sessionId);
  return updated;
}

async function refreshJoinedSlotMessages(sessionId: string) {
  const session = await prisma.matchSession.findUnique({ where: { id: sessionId } });
  if (
    !session ||
    session.status === "LINEUPS_CONFIRMED" ||
    session.status === "IN_PROGRESS" ||
    session.status === "COMPLETED"
  ) {
    return;
  }

  const joined = await prisma.matchRsvp.findMany({
    where: { sessionId, status: "JOINED" },
    orderBy: { respondedAt: "asc" },
    include: { user: true },
  });

  const filled = joined.length >= OPEN_SLOTS || session.status === "TEAMS_SET";

  for (let i = 0; i < joined.length; i++) {
    const rsvp = joined[i];
    const chatId = rsvp.tgChatId || notifyChatId(rsvp.user);
    const text = filled
      ? `✅ Вы в составе 5v5 на ${formatDate(session.date)}\n\nМесто: <b>${i + 1}/${OPEN_SLOTS}</b>\nСостав набран. Ждём утверждения составов админом.`
      : `✅ Вы в составе 5v5 на ${formatDate(session.date)}\n\nМесто: <b>${i + 1}/${OPEN_SLOTS}</b>\nЖдём остальных…`;
    if (chatId && rsvp.tgMessageId) {
      await editTelegramInviteMessage(
        chatId,
        rsvp.tgMessageId,
        text,
        filled ? null : signupKeyboard(sessionId),
        hasInvitePhoto(session)
      );
    }
  }
}

async function refreshQueueMessages(sessionId: string) {
  const session = await prisma.matchSession.findUnique({ where: { id: sessionId } });
  if (!session) return;

  const queued = await prisma.matchRsvp.findMany({
    where: { sessionId, status: "QUEUED" },
    orderBy: { respondedAt: "asc" },
    include: { user: true },
  });

  for (let i = 0; i < queued.length; i++) {
    const rsvp = queued[i];
    const chatId = rsvp.tgChatId || notifyChatId(rsvp.user);
    const text = `⏳ Состав 5v5 на ${formatDate(session.date)} уже набран (10/10).\n\nВы в очереди: <b>#${i + 1}</b>\nЕсли кто-то выйдет — займёте место автоматически.`;
    if (chatId && rsvp.tgMessageId) {
      await editTelegramInviteMessage(
        chatId,
        rsvp.tgMessageId,
        text,
        signupKeyboard(sessionId),
        hasInvitePhoto(session)
      );
    }
  }
}

export async function createOpenSignupSession(opts: {
  date: Date;
  inviteUserIds: string[];
  inviteImageUrl?: string | null;
}) {
  const uniqueIds = [...new Set(opts.inviteUserIds)];
  if (!uniqueIds.length) {
    throw new Error("Выберите хотя бы одного ученика");
  }

  const users = await prisma.user.findMany({
    where: { id: { in: uniqueIds }, role: { in: PLAYER_ROLES } },
  });
  if (!users.length) {
    throw new Error("Нет подходящих учеников");
  }

  const inviteImageUrl =
    typeof opts.inviteImageUrl === "string" && opts.inviteImageUrl.trim()
      ? opts.inviteImageUrl.trim()
      : null;

  const session = await prisma.matchSession.create({
    data: {
      date: opts.date,
      status: "PLANNED",
      mode: "OPEN_SIGNUP",
      inviteImageUrl,
      rsvps: {
        create: users.map((u) => ({
          userId: u.id,
          status: "INVITED",
          tgChatId: notifyChatId(u),
        })),
      },
    },
    include: { rsvps: { include: { user: true } } },
  });

  const inviteText = `🎮 <b>Открыта запись на 5v5</b>\n\nДата: ${formatDate(session.date)}\n\nНажмите кнопку ниже. Первые 10 попадают в состав, остальные — в очередь.`;

  for (const rsvp of session.rsvps) {
    const chatId = notifyChatId(rsvp.user);
    if (!chatId) continue;
    const sent = await sendTelegramInviteDetailed(
      chatId,
      inviteText,
      signupKeyboard(session.id),
      inviteImageUrl
    );
    if (sent.ok && sent.messageId != null) {
      await prisma.matchRsvp.update({
        where: { id: rsvp.id },
        data: { tgMessageId: sent.messageId, tgChatId: chatId },
      });
    }
  }

  return session;
}

/** Ученики с Telegram; withCoach — добавить тренера (для ручного выбора, не для «всем») */
export async function listStudentsWithTelegram(withCoach = false) {
  return prisma.user.findMany({
    where: {
      role: withCoach ? { in: PLAYER_ROLES } : "STUDENT",
      telegramChatId: { not: null },
    },
    orderBy: { firstName: "asc" },
  });
}

type SignupActionResult = {
  ok: boolean;
  alert?: string;
  toast?: string;
};

async function assertEditableOpenSession(sessionId: string) {
  const session = await prisma.matchSession.findUnique({ where: { id: sessionId } });
  if (!session) return { error: "Сессия не найдена" as const };
  if (session.mode !== "OPEN_SIGNUP") {
    return { error: "Это не открытая запись" as const };
  }
  if (session.status === "IN_PROGRESS" || session.status === "COMPLETED") {
    return { error: "Сессия уже началась или завершена" as const };
  }
  return { session };
}

export async function rsvpJoin(userId: string, sessionId: string): Promise<SignupActionResult> {
  try {
    const outcome = await prisma.$transaction(
      async (tx) => {
        const session = await tx.matchSession.findUnique({ where: { id: sessionId } });
        if (!session || session.mode !== "OPEN_SIGNUP") {
          return { kind: "err" as const, alert: "Сессия не найдена" };
        }
        if (session.status === "IN_PROGRESS" || session.status === "COMPLETED") {
          return { kind: "err" as const, alert: "Запись закрыта — сессия уже идёт" };
        }

        const rsvp = await tx.matchRsvp.findUnique({
          where: { sessionId_userId: { sessionId, userId } },
        });
        if (!rsvp) {
          return { kind: "err" as const, alert: "Вас нет в списке приглашённых" };
        }
        if (rsvp.status === "JOINED") {
          return { kind: "err" as const, alert: "Вы уже в составе" };
        }
        if (rsvp.status === "QUEUED") {
          return { kind: "err" as const, alert: "Вы уже в очереди" };
        }
        if (rsvp.status === "REMOVED") {
          return { kind: "err" as const, alert: "Вас сняли с этой сессии" };
        }

        const other = await tx.matchRsvp.findFirst({
          where: {
            userId,
            status: "JOINED",
            sessionId: { not: sessionId },
            session: {
              mode: "OPEN_SIGNUP",
              status: { in: ["PLANNED", "TEAMS_SET", "LINEUPS_CONFIRMED"] },
            },
          },
        });
        if (other) {
          return {
            kind: "err" as const,
            alert: "Вы уже записаны в другой открытый 5v5",
          };
        }

        const joinedCount = await tx.matchRsvp.count({
          where: { sessionId, status: "JOINED" },
        });

        const now = new Date();
        if (joinedCount < OPEN_SLOTS) {
          await tx.matchRsvp.update({
            where: { id: rsvp.id },
            data: { status: "JOINED", respondedAt: now },
          });
          const slot = joinedCount + 1;
          return {
            kind: "joined" as const,
            slot,
            filled: slot === OPEN_SLOTS,
          };
        }

        await tx.matchRsvp.update({
          where: { id: rsvp.id },
          data: { status: "QUEUED", respondedAt: now },
        });
        const queuePos =
          (await tx.matchRsvp.count({
            where: { sessionId, status: "QUEUED" },
          })) || 1;
        return { kind: "queued" as const, queuePos };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    if (outcome.kind === "err") {
      return { ok: false, alert: outcome.alert };
    }

    const session = await prisma.matchSession.findUnique({ where: { id: sessionId } });
    if (!session) return { ok: false, alert: "Сессия не найдена" };

    const rsvp = await prisma.matchRsvp.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
      include: { user: true },
    });
    const chatId = rsvp?.tgChatId || (rsvp ? notifyChatId(rsvp.user) : null);

    if (outcome.kind === "joined") {
      const text = `✅ Вы в составе 5v5 на ${formatDate(session.date)}\n\nМесто: <b>${outcome.slot}/${OPEN_SLOTS}</b>${
        outcome.filled
          ? "\n\nСостав набран. Ждём утверждения составов админом."
          : "\nЖдём остальных…"
      }`;
      if (chatId && rsvp?.tgMessageId) {
        await editTelegramInviteMessage(
          chatId,
          rsvp.tgMessageId,
          text,
          outcome.filled ? null : signupKeyboard(sessionId),
          hasInvitePhoto(session)
        );
      }

      if (outcome.filled) {
        await rebalanceOpenSession(sessionId);
        await refreshJoinedSlotMessages(sessionId);
      } else {
        await refreshJoinedSlotMessages(sessionId);
      }

      return {
        ok: true,
        toast: `Вы ${outcome.slot}/${OPEN_SLOTS}`,
      };
    }

    const text = `⏳ Состав 5v5 на ${formatDate(session.date)} уже набран (10/10).\n\nВы в очереди: <b>#${outcome.queuePos}</b>\nЕсли кто-то выйдет — займёте место автоматически.`;
    if (chatId && rsvp?.tgMessageId) {
      await editTelegramInviteMessage(
        chatId,
        rsvp.tgMessageId,
        text,
        signupKeyboard(sessionId),
        hasInvitePhoto(session)
      );
    }
    await refreshQueueMessages(sessionId);

    return { ok: true, toast: `Очередь #${outcome.queuePos}` };
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2034"
    ) {
      return { ok: false, alert: "Слишком много запросов, нажмите ещё раз" };
    }
    console.error(e);
    return { ok: false, alert: "Не удалось записаться" };
  }
}

async function promoteFirstQueued(sessionId: string) {
  const next = await prisma.matchRsvp.findFirst({
    where: { sessionId, status: "QUEUED" },
    orderBy: { respondedAt: "asc" },
    include: { user: true },
  });
  if (!next) return null;

  await prisma.matchRsvp.update({
    where: { id: next.id },
    data: { status: "JOINED", respondedAt: new Date() },
  });

  return next;
}

async function afterRosterChange(sessionId: string, promotedUserId?: string) {
  const joinedCount = await prisma.matchRsvp.count({
    where: { sessionId, status: "JOINED" },
  });

  const session = await prisma.matchSession.findUnique({ where: { id: sessionId } });
  if (!session) return;

  if (joinedCount === OPEN_SLOTS) {
    await rebalanceOpenSession(sessionId);
    await refreshJoinedSlotMessages(sessionId);
    await refreshQueueMessages(sessionId);
    if (promotedUserId) {
      const promoted = await prisma.matchRsvp.findUnique({
        where: { sessionId_userId: { sessionId, userId: promotedUserId } },
        include: { user: true },
      });
      if (promoted) {
        const chatId = promoted.tgChatId || notifyChatId(promoted.user);
        await sendTelegramMessage(
          chatId,
          `🎉 Место освободилось! Вы вошли в состав 5v5 на ${formatDate(session.date)}.\nКоманды пересобраны — ждём утверждения админом.`
        );
      }
    }
  } else {
    await rebalanceOpenSession(sessionId);
    await refreshJoinedSlotMessages(sessionId);
    await refreshQueueMessages(sessionId);

    if (promotedUserId) {
      const promoted = await prisma.matchRsvp.findUnique({
        where: { sessionId_userId: { sessionId, userId: promotedUserId } },
        include: { user: true },
      });
      if (promoted) {
        const slot = await prisma.matchRsvp.count({
          where: {
            sessionId,
            status: "JOINED",
            respondedAt: { lte: promoted.respondedAt ?? new Date() },
          },
        });
        const chatId = promoted.tgChatId || notifyChatId(promoted.user);
        const text = `🎉 Место освободилось! Вы в составе 5v5 на ${formatDate(session.date)}\n\nМесто: <b>${slot}/${OPEN_SLOTS}</b>`;
        if (chatId && promoted.tgMessageId) {
          await editTelegramInviteMessage(
            chatId,
            promoted.tgMessageId,
            text,
            signupKeyboard(sessionId),
            hasInvitePhoto(session)
          );
        } else {
          await sendTelegramMessage(chatId, text);
        }
      }
    }
  }
}

export async function rsvpDecline(
  userId: string,
  sessionId: string
): Promise<SignupActionResult> {
  const gate = await assertEditableOpenSession(sessionId);
  if ("error" in gate && gate.error) {
    return { ok: false, alert: gate.error };
  }

  const rsvp = await prisma.matchRsvp.findUnique({
    where: { sessionId_userId: { sessionId, userId } },
    include: { user: true },
  });
  if (!rsvp) {
    return { ok: false, alert: "Вас нет в списке приглашённых" };
  }
  if (rsvp.status === "DECLINED") {
    return { ok: false, alert: "Вы уже отказались" };
  }
  if (rsvp.status === "REMOVED") {
    return { ok: false, alert: "Вас уже сняли с сессии" };
  }

  const wasJoined = rsvp.status === "JOINED";

  await prisma.matchRsvp.update({
    where: { id: rsvp.id },
    data: { status: "DECLINED", respondedAt: new Date() },
  });

  const session = gate.session!;
  const chatId = rsvp.tgChatId || notifyChatId(rsvp.user);
  const text = `❌ Вы отказались от 5v5 на ${formatDate(session.date)}.`;
  if (chatId && rsvp.tgMessageId) {
    await editTelegramInviteMessage(
      chatId,
      rsvp.tgMessageId,
      text,
      null,
      hasInvitePhoto(session)
    );
  }

  let promotedUserId: string | undefined;
  if (wasJoined) {
    const promoted = await promoteFirstQueued(sessionId);
    promotedUserId = promoted?.userId;
  }

  if (wasJoined) {
    await afterRosterChange(sessionId, promotedUserId);
  } else {
    await refreshQueueMessages(sessionId);
  }

  return { ok: true, toast: "Отказ принят" };
}

/**
 * Тренер сам записывается на открытый 5v5 кнопкой на сайте — без приглашения в Telegram.
 * Дальше всё как у учеников: свободно место — в состав, нет — в очередь.
 */
export async function coachJoinSignup(sessionId: string, coachId: string) {
  const gate = await assertEditableOpenSession(sessionId);
  if ("error" in gate && gate.error) {
    return { ok: false, alert: gate.error };
  }
  // Запись «приглашён» для тренера; если раньше отказался или снят — приглашаем заново.
  // Уже в составе или в очереди — ничего не трогаем, rsvpJoin так и ответит.
  const rsvp = await prisma.matchRsvp.findUnique({
    where: { sessionId_userId: { sessionId, userId: coachId } },
  });
  if (!rsvp) {
    await prisma.matchRsvp.create({ data: { sessionId, userId: coachId, status: "INVITED" } });
  } else if (rsvp.status === "DECLINED" || rsvp.status === "REMOVED") {
    await prisma.matchRsvp.update({
      where: { id: rsvp.id },
      data: { status: "INVITED", respondedAt: null },
    });
  }
  return rsvpJoin(coachId, sessionId);
}

/** Тренер выходит из открытого 5v5 — место займёт первый из очереди */
export async function coachLeaveSignup(sessionId: string, coachId: string) {
  return rsvpDecline(coachId, sessionId);
}

/** Админ снимает игрока из состава; первый из очереди занимает место. */
export async function adminRemoveFromSignup(sessionId: string, userId: string) {
  const gate = await assertEditableOpenSession(sessionId);
  if ("error" in gate && gate.error) {
    throw new Error(gate.error);
  }

  const rsvp = await prisma.matchRsvp.findUnique({
    where: { sessionId_userId: { sessionId, userId } },
    include: { user: true },
  });
  if (!rsvp) throw new Error("RSVP не найден");
  if (rsvp.status !== "JOINED" && rsvp.status !== "QUEUED") {
    throw new Error("Игрок не в составе и не в очереди");
  }

  const wasJoined = rsvp.status === "JOINED";

  await prisma.matchRsvp.update({
    where: { id: rsvp.id },
    data: { status: "REMOVED", respondedAt: new Date() },
  });

  const session = gate.session!;
  const chatId = rsvp.tgChatId || notifyChatId(rsvp.user);
  const text = `🚫 Вас сняли с 5v5 на ${formatDate(session.date)}.`;
  if (chatId && rsvp.tgMessageId) {
    await editTelegramInviteMessage(
      chatId,
      rsvp.tgMessageId,
      text,
      null,
      hasInvitePhoto(session)
    );
  } else {
    await sendTelegramMessage(chatId, text);
  }

  let promotedUserId: string | undefined;
  if (wasJoined) {
    const promoted = await promoteFirstQueued(sessionId);
    promotedUserId = promoted?.userId;
    await afterRosterChange(sessionId, promotedUserId);
  } else {
    await refreshQueueMessages(sessionId);
  }

  return { promotedUserId };
}

/** Повторно отправить приглашение отказавшемуся / снятому. */
export async function adminReinvitePlayer(sessionId: string, userId: string) {
  const gate = await assertEditableOpenSession(sessionId);
  if ("error" in gate && gate.error) {
    throw new Error(gate.error);
  }

  const rsvp = await prisma.matchRsvp.findUnique({
    where: { sessionId_userId: { sessionId, userId } },
    include: { user: true },
  });
  if (!rsvp) throw new Error("RSVP не найден");
  if (rsvp.status !== "DECLINED" && rsvp.status !== "REMOVED") {
    throw new Error("Повторный запрос только для отказа / снятых");
  }

  const session = gate.session!;
  const chatId = rsvp.tgChatId || notifyChatId(rsvp.user);
  if (!chatId) {
    throw new Error("У ученика нет привязанного Telegram");
  }

  const inviteText = `🎮 <b>Повторный запрос на 5v5</b>\n\nДата: ${formatDate(session.date)}\n\nНажмите кнопку ниже. Первые 10 попадают в состав, остальные — в очередь.`;

  const sent = await sendTelegramInviteDetailed(
    chatId,
    inviteText,
    signupKeyboard(sessionId),
    session.inviteImageUrl
  );
  if (!sent.ok) {
    throw new Error("Не удалось отправить сообщение в Telegram");
  }

  await prisma.matchRsvp.update({
    where: { id: rsvp.id },
    data: {
      status: "INVITED",
      respondedAt: null,
      tgChatId: chatId,
      tgMessageId: sent.messageId ?? null,
    },
  });

  return { ok: true };
}

export async function startMatchSession(sessionId: string) {
  const session = await prisma.matchSession.findUnique({
    where: { id: sessionId },
    include: { games: true },
  });
  if (!session) throw new Error("Сессия не найдена");
  if (session.status === "IN_PROGRESS") {
    throw new Error("Сессия уже начата");
  }
  if (session.status === "COMPLETED") {
    throw new Error("Сессия завершена");
  }
  if (session.status !== "LINEUPS_CONFIRMED") {
    throw new Error("Сначала утвердите составы");
  }

  return prisma.matchSession.update({
    where: { id: sessionId },
    data: {
      status: "IN_PROGRESS",
      startedAt: new Date(),
    },
  });
}

export async function handleMatchSignupCallback(opts: {
  callbackQueryId: string;
  data: string;
  telegramUserId: string;
  chatId: string;
}): Promise<void> {
  const parts = opts.data.split(":");
  if (parts.length !== 3 || parts[0] !== "m5") {
    await answerCallbackQuery(opts.callbackQueryId, "Неизвестная кнопка");
    return;
  }

  const sessionId = parts[1];
  const choice = parts[2];

  if (sessionId === "test") {
    await answerCallbackQuery(
      opts.callbackQueryId,
      "Это тест-превью — запись не создаётся",
      true
    );
    return;
  }

  const user = await prisma.user.findUnique({
    where: { telegramId: opts.telegramUserId },
  });
  if (!user) {
    await answerCallbackQuery(
      opts.callbackQueryId,
      "Сначала войдите на сайт через бота",
      true
    );
    return;
  }

  // Обновим chat id на всякий случай
  if (!user.telegramChatId) {
    await prisma.user.update({
      where: { id: user.id },
      data: { telegramChatId: opts.chatId },
    });
  }

  const result =
    choice === "y"
      ? await rsvpJoin(user.id, sessionId)
      : choice === "n"
        ? await rsvpDecline(user.id, sessionId)
        : { ok: false, alert: "Неизвестное действие" };

  await answerCallbackQuery(
    opts.callbackQueryId,
    result.alert || result.toast || (result.ok ? "Ок" : "Ошибка"),
    Boolean(result.alert)
  );
}
