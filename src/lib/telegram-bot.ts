import { prisma } from "@/lib/db";
import { isAdminTelegramId } from "@/lib/session";
import {
  answerCallbackQuery,
  sendTelegramMessage,
  type ReplyKeyboard,
} from "@/lib/telegram";
import { upsertTelegramUser } from "@/lib/telegram-auth";
import { handleMatchSignupCallback } from "@/lib/match-signup";
import { castMvpVote, formatMvpStatusTelegram } from "@/lib/match-mvp";
import { displayName, formatDate, parseJsonArray } from "@/lib/utils";
import { formatPoints } from "@/lib/points";
import { rankLabel } from "@/lib/labels";
import { parseTeamAssignments } from "@/lib/match-lineup";

type TelegramUserMsg = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
};

type TelegramMessage = {
  message_id: number;
  from: TelegramUserMsg;
  chat: { id: number; type: string };
  text?: string;
};

type TelegramCallbackQuery = {
  id: string;
  from: TelegramUserMsg;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
  };
  data?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

const MAIN_KEYBOARD: ReplyKeyboard = {
  resize_keyboard: true,
  keyboard: [[{ text: "Мой профиль" }, { text: "5x5" }, { text: "MVP" }]],
};

const OPEN_SLOTS = 10;

function listNames(users: { firstName: string; lastName?: string | null; username?: string | null }[]) {
  if (!users.length) return "  —";
  return users.map((u, i) => `  ${i + 1}. ${displayName(u)}`).join("\n");
}

async function replySignupStatus(userId: string): Promise<string> {
  const session = await prisma.matchSession.findFirst({
    where: {
      mode: "OPEN_SIGNUP",
      status: { in: ["PLANNED", "TEAMS_SET", "LINEUPS_CONFIRMED", "IN_PROGRESS"] },
    },
    orderBy: { date: "desc" },
    include: {
      rsvps: {
        include: {
          user: {
            select: { firstName: true, lastName: true, username: true },
          },
        },
        orderBy: { respondedAt: "asc" },
      },
    },
  });

  if (!session) {
    return "📅 <b>Запись</b>\nСейчас нет открытой записи на субботний 5v5.";
  }

  const joined = session.rsvps.filter((r) => r.status === "JOINED");
  const queued = session.rsvps.filter((r) => r.status === "QUEUED");
  const declined = session.rsvps.filter((r) => r.status === "DECLINED");
  const invited = session.rsvps.filter((r) => r.status === "INVITED");
  const mine = session.rsvps.find((r) => r.userId === userId);

  let myLine = "Вы ещё не ответили.";
  if (mine?.status === "JOINED") {
    const place = joined.findIndex((r) => r.userId === userId) + 1;
    myLine = `Вы в составе: место <b>${place}/${OPEN_SLOTS}</b>.`;
  } else if (mine?.status === "QUEUED") {
    const place = queued.findIndex((r) => r.userId === userId) + 1;
    myLine = `Вы в очереди: <b>#${place}</b>.`;
  } else if (mine?.status === "DECLINED") {
    myLine = "Вы отказались.";
  } else if (mine?.status === "REMOVED") {
    myLine = "Вас сняли с записи.";
  } else if (mine?.status === "INVITED") {
    myLine = "Вас пригласили — нажмите кнопку в сообщении-приглашении.";
  }

  const filled = joined.length >= OPEN_SLOTS;
  return [
    `📅 <b>Запись на 5v5</b> · ${formatDate(session.date)}`,
    `Статус: ${session.status}${filled ? " · состав набран" : ""}`,
    "",
    `✅ В составе: <b>${joined.length}/${OPEN_SLOTS}</b>`,
    listNames(joined.map((r) => r.user)),
    "",
    ...(queued.length
      ? [`⏳ Очередь: <b>${queued.length}</b>`, listNames(queued.map((r) => r.user)), ""]
      : []),
    ...(declined.length
      ? [`❌ Отказ: <b>${declined.length}</b>`, listNames(declined.map((r) => r.user)), ""]
      : []),
    `✉️ Ещё не ответили: <b>${invited.length}</b>`,
    "",
    myLine,
  ].join("\n");
}

async function formatConfirmedLineupBlock(
  title: string,
  userId: string,
  assignments: ReturnType<typeof parseTeamAssignments>
): Promise<string> {
  const radiant = Object.entries(assignments)
    .filter(([, a]) => a.team === "RADIANT")
    .sort((a, b) => a[1].position - b[1].position);
  const dire = Object.entries(assignments)
    .filter(([, a]) => a.team === "DIRE")
    .sort((a, b) => a[1].position - b[1].position);
  const users = await prisma.user.findMany({
    where: { id: { in: [...radiant, ...dire].map(([id]) => id) } },
    include: { profile: { select: { finalRating: true } } },
  });
  const byId = Object.fromEntries(users.map((u) => [u.id, u]));
  const { teamDisplayName } = await import("@/lib/team-names");
  const radiantName = teamDisplayName(
    radiant.map(([id]) => ({
      id,
      firstName: byId[id]?.firstName,
      lastName: byId[id]?.lastName,
      username: byId[id]?.username,
      finalRating: byId[id]?.profile?.finalRating ?? 0,
    })),
    "Team A"
  );
  const direName = teamDisplayName(
    dire.map(([id]) => ({
      id,
      firstName: byId[id]?.firstName,
      lastName: byId[id]?.lastName,
      username: byId[id]?.username,
      finalRating: byId[id]?.profile?.finalRating ?? 0,
    })),
    "Team B"
  );
  const line = (rows: [string, { position: number }][]) =>
    rows.map(([id, a]) => `  ${a.position}: ${displayName(byId[id])}`).join("\n");
  const me = assignments[userId];
  const you = me
    ? `Вы: ${me.team === "DIRE" ? direName : radiantName}, слот ${me.position}`
    : "";

  return (
    `<b>${title}</b>\n` +
    (you ? `${you}\n\n` : "\n") +
    `<b>${radiantName}</b>\n${line(radiant)}\n\n` +
    `<b>${direName}</b>\n${line(dire)}`
  );
}

async function replyTeamsStatus(userId: string): Promise<string> {
  const session = await prisma.matchSession.findFirst({
    where: {
      status: { in: ["TEAMS_SET", "LINEUPS_CONFIRMED", "IN_PROGRESS"] },
    },
    orderBy: { date: "desc" },
  });
  if (!session) {
    return "⚔️ <b>Команды</b>\nСейчас нет активной сессии 5v5.";
  }

  // До утверждения — только кто есть, без команд и позиций
  if (session.status === "TEAMS_SET") {
    const ids = [
      ...parseJsonArray(session.radiantPlayerIds),
      ...parseJsonArray(session.direPlayerIds),
    ];
    const users = ids.length
      ? await prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, firstName: true, lastName: true, username: true },
        })
      : [];
    const byId = Object.fromEntries(users.map((u) => [u.id, u]));
    const names = ids
      .map((id, i) => {
        const u = byId[id];
        return u ? `  ${i + 1}. ${displayName(u)}` : null;
      })
      .filter(Boolean)
      .join("\n");

    return [
      `⚔️ <b>Команды</b> · ${formatDate(session.date)}`,
      `Игроки набраны (${ids.length}/10). Составы ещё не утверждены — команд и позиций нет.`,
      "",
      names || "  —",
    ].join("\n");
  }

  const assignments = parseTeamAssignments(session.teamAssignments);
  if (!Object.keys(assignments).length) {
    return `⚔️ <b>Команды</b> · ${formatDate(session.date)}\nСоставы ещё не собраны.`;
  }

  const game1 = await formatConfirmedLineupBlock("Игра №1", userId, assignments);
  const parts = [
    `⚔️ <b>Команды</b> · ${formatDate(session.date)}`,
    `Статус: ${session.status}`,
    "",
    game1,
  ];

  if (session.lineupsGame2Confirmed) {
    const g2 = parseTeamAssignments(session.teamAssignmentsGame2);
    if (Object.keys(g2).length) {
      parts.push("", "————", "", await formatConfirmedLineupBlock("Игра №2", userId, g2));
    }
  }

  return parts.join("\n");
}

async function replyFiveXFive(chatId: string, userId: string) {
  const [signup, teams] = await Promise.all([
    replySignupStatus(userId),
    replyTeamsStatus(userId),
  ]);
  await sendTelegramMessage(chatId, `${signup}\n\n————\n\n${teams}`, MAIN_KEYBOARD);
}

async function findUserByTelegram(from: TelegramUserMsg) {
  return prisma.user.findUnique({
    where: { telegramId: String(from.id) },
    include: { profile: true },
  });
}

async function linkByTelegramId(from: TelegramUserMsg, chatId: string) {
  const telegramId = String(from.id);
  const isAdmin = isAdminTelegramId(telegramId);

  const existing = await prisma.user.findUnique({ where: { telegramId } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        telegramChatId: chatId,
        firstName: from.first_name,
        lastName: from.last_name || null,
        username: from.username || null,
      },
    });
    return existing.id;
  }

  if (isAdmin) {
    const admin = await upsertTelegramUser({
      id: from.id,
      first_name: from.first_name,
      last_name: from.last_name,
      username: from.username,
    });
    await prisma.user.update({
      where: { id: admin.id },
      data: { telegramChatId: chatId },
    });
    return admin.id;
  }

  return null;
}

async function linkByToken(token: string, from: TelegramUserMsg, chatId: string) {
  const user = await prisma.user.findUnique({ where: { telegramLinkToken: token } });
  if (!user) return null;

  const telegramId = String(from.id);
  const conflict = await prisma.user.findFirst({
    where: { telegramId, id: { not: user.id } },
  });
  if (conflict) return "conflict";

  await prisma.user.update({
    where: { id: user.id },
    data: {
      telegramId,
      telegramChatId: chatId,
      firstName: from.first_name,
      lastName: from.last_name || null,
      username: from.username || null,
    },
  });

  return user.id;
}

async function completeWebLogin(token: string, from: TelegramUserMsg, chatId: string) {
  const ticket = await prisma.loginTicket.findUnique({ where: { token } });
  if (!ticket || ticket.status !== "PENDING" || ticket.expiresAt < new Date()) {
    return false;
  }

  const user = await upsertTelegramUser({
    id: from.id,
    first_name: from.first_name,
    last_name: from.last_name,
    username: from.username,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { telegramChatId: chatId },
  });

  await prisma.loginTicket.update({
    where: { id: ticket.id },
    data: { status: "READY", userId: user.id },
  });

  return true;
}

async function replyLiveMenu(chatId: string, from: TelegramUserMsg, text: string) {
  const user = await findUserByTelegram(from);
  if (!user) {
    await sendTelegramMessage(
      chatId,
      "Сначала привяжите Telegram в профиле на сайте или /start.",
      MAIN_KEYBOARD
    );
    return;
  }

  if (text === "Мой профиль") {
    const p = user.profile;
    await sendTelegramMessage(
      chatId,
      `👤 <b>${displayName(user)}</b>\n\n` +
        `Ранг: ${rankLabel(p?.rankTier) ?? "—"}\n` +
        `Сила: <b>${p?.finalRating ?? "—"}</b>\n` +
        `SkillMod: +${p?.skillMod ?? 0}\n` +
        `TiltMod: ${p?.vibeMod ?? 0}\n` +
        `Роль: ${p?.primaryRole ?? "—"}\n\n` +
        `🏅 Очки: <b>${formatPoints(p?.totalPoints ?? 0)}</b>\n` +
        `Победы/поражения: ${p?.wins ?? 0}/${p?.losses ?? 0}`,
      MAIN_KEYBOARD
    );
    return;
  }

  // «5x5» + старые кнопки записи/команд → один экран
  if (text === "5x5" || text === "Запись 5x5" || text === "Команды 5x5") {
    await replyFiveXFive(chatId, user.id);
    return;
  }

  if (text === "MVP") {
    const { text: mvpText, keyboard } = await formatMvpStatusTelegram(user.id);
    await sendTelegramMessage(chatId, mvpText, keyboard ?? MAIN_KEYBOARD);
    return;
  }

  // Старые кнопки — мягкий редирект на новое меню
  if (text === "Очки" || text === "Голосование") {
    await sendTelegramMessage(
      chatId,
      text === "Очки"
        ? "Очки теперь в «Мой профиль». Обновите меню: /menu"
        : "Кнопка «Голосование» убрана. Обновите меню: /menu",
      MAIN_KEYBOARD
    );
    return;
  }

  await sendTelegramMessage(
    chatId,
    "Выберите кнопку меню ниже.",
    MAIN_KEYBOARD
  );
}

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const cq = update.callback_query;
  if (cq?.data && cq.from) {
    const chatId = String(cq.message?.chat.id ?? cq.from.id);

    if (cq.data.startsWith("mvp:")) {
      const parts = cq.data.split(":");
      const sessionId = parts[1];
      const nomineeId = parts[2];
      const voter = await findUserByTelegram(cq.from);
      if (!voter) {
        await answerCallbackQuery(cq.id, "Сначала привяжите Telegram", true);
        return;
      }
      try {
        const voteResult = await castMvpVote({
          sessionId,
          voterId: voter.id,
          nomineeId,
        });
        await answerCallbackQuery(cq.id, "Голос за MVP принят");
        const { text: mvpText } = await formatMvpStatusTelegram(voter.id);
        const doneLine = voteResult.resolved
          ? "\n\n📣 Все проголосовали — итог MVP разослан участникам."
          : "";
        await sendTelegramMessage(
          chatId,
          `✅ Голос учтён (анонимно).${doneLine}\n\n${mvpText}`,
          MAIN_KEYBOARD
        );
      } catch (e) {
        await answerCallbackQuery(
          cq.id,
          e instanceof Error ? e.message : "Ошибка",
          true
        );
      }
      return;
    }

    await handleMatchSignupCallback({
      callbackQueryId: cq.id,
      data: cq.data,
      telegramUserId: String(cq.from.id),
      chatId,
    });
    return;
  }

  const message = update.message;
  if (!message?.text || !message.from) return;

  const chatId = String(message.chat.id);
  const text = message.text.trim();

  if (
    text === "Мой профиль" ||
    text === "5x5" ||
    text === "MVP" ||
    text === "Очки" ||
    text === "Запись 5x5" ||
    text === "Команды 5x5" ||
    text === "Голосование"
  ) {
    await replyLiveMenu(chatId, message.from, text);
    return;
  }

  if (!text.startsWith("/start") && !text.startsWith("/menu")) return;

  if (text.startsWith("/menu")) {
    await sendTelegramMessage(chatId, "Меню СТАРТ+:", MAIN_KEYBOARD);
    return;
  }

  const param = text.split(/\s+/)[1];

  if (param?.startsWith("login_")) {
    const token = param.slice(6);
    const ok = await completeWebLogin(token, message.from, chatId);
    if (ok) {
      await sendTelegramMessage(
        chatId,
        "✅ Вход подтверждён! Вернитесь на сайт — страница обновится сама.",
        MAIN_KEYBOARD
      );
    } else {
      await sendTelegramMessage(
        chatId,
        "❌ Ссылка для входа устарела. Нажмите «Войти через Telegram» на сайте ещё раз."
      );
    }
    return;
  }

  if (param?.startsWith("link_")) {
    const token = param.slice(5);
    const result = await linkByToken(token, message.from, chatId);

    if (result === "conflict") {
      await sendTelegramMessage(
        chatId,
        "❌ Этот Telegram уже привязан к другому аккаунту на сайте."
      );
      return;
    }

    if (result) {
      await sendTelegramMessage(
        chatId,
        "✅ Telegram привязан! Меню ниже — профиль, очки, 5x5.",
        MAIN_KEYBOARD
      );
      return;
    }

    await sendTelegramMessage(
      chatId,
      "❌ Ссылка для привязки недействительна. Получите новую в профиле на сайте."
    );
    return;
  }

  const linkedId = await linkByTelegramId(message.from, chatId);
  if (linkedId) {
    await sendTelegramMessage(
      chatId,
      "✅ Бот подключён! Кнопки меню ниже.",
      MAIN_KEYBOARD
    );
    return;
  }

  await sendTelegramMessage(
    chatId,
    "👋 Привет! Чтобы войти на сайт, откройте страницу входа и нажмите «Войти через бота»."
  );
}

export async function fetchTelegramUpdates(offset?: number) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token === "dev-token") return [];

  const { telegramBotUrl, telegramProxyHeaders } = await import("@/lib/telegram-api");
  const url = new URL(telegramBotUrl(token, "getUpdates"));
  url.searchParams.set("timeout", "30");
  if (offset) url.searchParams.set("offset", String(offset));

  const res = await fetch(url.toString(), {
    headers: telegramProxyHeaders(),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) return [];

  const data = await res.json();
  return (data.result || []) as TelegramUpdate[];
}
