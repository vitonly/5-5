import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { balanceTeams } from "@/lib/team-balance";
import { parseSecondaryRoles } from "@/lib/secondary-roles";
import { displayName, formatDate, toJsonArray } from "@/lib/utils";
import { POSITION_LABELS } from "@/lib/labels";
import {
  answerCallbackQuery,
  editTelegramMessage,
  notifyChatId,
  sendTelegramMessage,
  sendTelegramMessageDetailed,
  type InlineKeyboard,
} from "@/lib/telegram";
import type { TeamAssignment } from "@/lib/match-lineup";

const OPEN_SLOTS = 10;

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

function teamLineText(
  teams: ReturnType<typeof balanceTeams>,
  side: "radiant" | "dire"
): string {
  const list = teams[side];
  return list
    .map((p) => `  ${POSITION_LABELS[p.position] ?? p.position}: ${p.name}`)
    .join("\n");
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

/** Пересобрать команды из текущих JOINED (ровно 10). */
export async function rebalanceOpenSession(sessionId: string) {
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

  const teams = balanceTeams(players);
  const updated = await prisma.matchSession.update({
    where: { id: sessionId },
    data: {
      status: "TEAMS_SET",
      radiantPlayerIds: toJsonArray(teams.radiant.map((p) => p.id)),
      direPlayerIds: toJsonArray(teams.dire.map((p) => p.id)),
      teamAssignments: buildAssignmentsJson(teams),
    },
  });

  return { session: updated, teams };
}

async function notifyTeamsFormed(
  sessionId: string,
  teams: ReturnType<typeof balanceTeams>
) {
  const session = await prisma.matchSession.findUnique({ where: { id: sessionId } });
  if (!session) return;

  const joined = await prisma.matchRsvp.findMany({
    where: { sessionId, status: "JOINED" },
    include: { user: true },
  });

  const assignment: TeamAssignment = JSON.parse(session.teamAssignments || "{}");
  const header = `⚔️ <b>Команды 5v5 собраны</b>\n${formatDate(session.date)}\n\n<b>Radiant</b>\n${teamLineText(teams, "radiant")}\n\n<b>Dire</b>\n${teamLineText(teams, "dire")}`;

  for (const rsvp of joined) {
    const a = assignment[rsvp.userId];
    const side = a?.team === "DIRE" ? "Dire" : "Radiant";
    const pos = a?.position ? POSITION_LABELS[a.position] ?? String(a.position) : "?";
    const text = `${header}\n\nВы: <b>${side}</b>, ${pos}`;
    const chatId = rsvp.tgChatId || notifyChatId(rsvp.user);
    if (rsvp.tgMessageId && chatId) {
      await editTelegramMessage(chatId, rsvp.tgMessageId, text, null);
    } else {
      await sendTelegramMessage(chatId, text);
    }
  }

  await refreshQueueMessages(sessionId);
}

async function refreshJoinedSlotMessages(sessionId: string) {
  const session = await prisma.matchSession.findUnique({ where: { id: sessionId } });
  if (!session || session.status === "TEAMS_SET" || session.status === "IN_PROGRESS") {
    return;
  }

  const joined = await prisma.matchRsvp.findMany({
    where: { sessionId, status: "JOINED" },
    orderBy: { respondedAt: "asc" },
    include: { user: true },
  });

  for (let i = 0; i < joined.length; i++) {
    const rsvp = joined[i];
    const chatId = rsvp.tgChatId || notifyChatId(rsvp.user);
    const text = `✅ Вы в составе 5v5 на ${formatDate(session.date)}\n\nМесто: <b>${i + 1}/${OPEN_SLOTS}</b>\nЖдём остальных…`;
    if (chatId && rsvp.tgMessageId) {
      await editTelegramMessage(chatId, rsvp.tgMessageId, text, signupKeyboard(sessionId));
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
      await editTelegramMessage(chatId, rsvp.tgMessageId, text, signupKeyboard(sessionId));
    }
  }
}

export async function createOpenSignupSession(opts: {
  date: Date;
  inviteUserIds: string[];
}) {
  const uniqueIds = [...new Set(opts.inviteUserIds)];
  if (!uniqueIds.length) {
    throw new Error("Выберите хотя бы одного ученика");
  }

  const users = await prisma.user.findMany({
    where: { id: { in: uniqueIds }, role: "STUDENT" },
  });
  if (!users.length) {
    throw new Error("Нет подходящих учеников");
  }

  const session = await prisma.matchSession.create({
    data: {
      date: opts.date,
      status: "PLANNED",
      mode: "OPEN_SIGNUP",
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
    const sent = await sendTelegramMessageDetailed(
      chatId,
      inviteText,
      signupKeyboard(session.id)
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

export async function listStudentsWithTelegram() {
  return prisma.user.findMany({
    where: {
      role: "STUDENT",
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
              status: { in: ["PLANNED", "TEAMS_SET"] },
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
        outcome.filled ? "\n\nСостав набран — формируем команды…" : "\nЖдём остальных…"
      }`;
      if (chatId && rsvp?.tgMessageId) {
        await editTelegramMessage(
          chatId,
          rsvp.tgMessageId,
          text,
          outcome.filled ? null : signupKeyboard(sessionId)
        );
      }

      if (outcome.filled) {
        const result = await rebalanceOpenSession(sessionId);
        if (result) await notifyTeamsFormed(sessionId, result.teams);
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
      await editTelegramMessage(chatId, rsvp.tgMessageId, text, signupKeyboard(sessionId));
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
    const result = await rebalanceOpenSession(sessionId);
    if (result) {
      await notifyTeamsFormed(sessionId, result.teams);
      if (promotedUserId) {
        const promoted = await prisma.matchRsvp.findUnique({
          where: { sessionId_userId: { sessionId, userId: promotedUserId } },
          include: { user: true },
        });
        if (promoted) {
          const chatId = promoted.tgChatId || notifyChatId(promoted.user);
          await sendTelegramMessage(
            chatId,
            `🎉 Место освободилось! Вы вошли в состав 5v5 на ${formatDate(session.date)}. Команды пересобраны.`
          );
        }
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
          await editTelegramMessage(
            chatId,
            promoted.tgMessageId,
            text,
            signupKeyboard(sessionId)
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
    await editTelegramMessage(chatId, rsvp.tgMessageId, text, null);
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
    await editTelegramMessage(chatId, rsvp.tgMessageId, text, null);
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

  const sent = await sendTelegramMessageDetailed(
    chatId,
    inviteText,
    signupKeyboard(sessionId)
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
  if (session.status !== "TEAMS_SET") {
    throw new Error("Сначала нужен полный состав (10 игроков)");
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
