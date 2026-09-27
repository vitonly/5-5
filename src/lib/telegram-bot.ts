import { prisma } from "@/lib/db";
import { isAdminTelegramId } from "@/lib/session";
import {
  answerCallbackQuery,
  sendTelegramMessage,
  type ReplyKeyboard,
} from "@/lib/telegram";
import { upsertTelegramUser } from "@/lib/telegram-auth";
import { handleMatchSignupCallback } from "@/lib/match-signup";
import { castMvpVote } from "@/lib/match-mvp";
import { getVotingSeason } from "@/lib/seasons";
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
  keyboard: [
    [{ text: "Мой профиль" }, { text: "Очки" }],
    [{ text: "Запись 5x5" }, { text: "Команды 5x5" }],
    [{ text: "Голосование" }],
  ],
};

const OPEN_SLOTS = 10;

function listNames(users: { firstName: string; lastName?: string | null; username?: string | null }[]) {
  if (!users.length) return "  —";
  return users.map((u, i) => `  ${i + 1}. ${displayName(u)}`).join("\n");
}

async function replySignupStatus(chatId: string, userId: string) {
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
    await sendTelegramMessage(
      chatId,
      "Сейчас нет открытой записи на субботний 5v5.",
      MAIN_KEYBOARD
    );
    return;
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
  const text = [
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

  await sendTelegramMessage(chatId, text, MAIN_KEYBOARD);
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
      `👤 <b>${displayName(user)}</b>\n\nРанг: ${rankLabel(p?.rankTier) ?? "—"}\nСила: <b>${p?.finalRating ?? "—"}</b>\nSkillMod: +${p?.skillMod ?? 0}\nTiltMod: ${p?.vibeMod ?? 0}\nРоль: ${p?.primaryRole ?? "—"}`,
      MAIN_KEYBOARD
    );
    return;
  }

  if (text === "Очки") {
    await sendTelegramMessage(
      chatId,
      `🏅 Очки платформы: <b>${formatPoints(user.profile?.totalPoints ?? 0)}</b>\nПобеды/поражения: ${user.profile?.wins ?? 0}/${user.profile?.losses ?? 0}`,
      MAIN_KEYBOARD
    );
    return;
  }

  if (text === "Запись 5x5") {
    await replySignupStatus(chatId, user.id);
    return;
  }

  if (text === "Команды 5x5") {
    const session = await prisma.matchSession.findFirst({
      where: {
        status: { in: ["TEAMS_SET", "LINEUPS_CONFIRMED", "IN_PROGRESS"] },
      },
      orderBy: { date: "desc" },
    });
    if (!session) {
      await sendTelegramMessage(chatId, "Сейчас нет активной сессии 5v5.", MAIN_KEYBOARD);
      return;
    }
    const assignments = parseTeamAssignments(session.teamAssignments);
    const me = assignments[user.id];
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
    await sendTelegramMessage(
      chatId,
      `⚔️ <b>5v5</b> ${formatDate(session.date)}\nСтатус: ${session.status}\n${
        me ? `Вы: ${me.team === "DIRE" ? direName : radiantName}, слот ${me.position}\n\n` : "\n"
      }<b>${radiantName}</b>\n${line(radiant)}\n\n<b>${direName}</b>\n${line(dire)}`,
      MAIN_KEYBOARD
    );
    return;
  }

  if (text === "Голосование") {
    const season = await getVotingSeason();
    if (!season || season.status !== "OPEN") {
      await sendTelegramMessage(chatId, "Сезон голосования сейчас закрыт.", MAIN_KEYBOARD);
      return;
    }
    const students = await prisma.user.findMany({
      where: { role: "STUDENT", id: { not: user.id } },
      select: { id: true },
    });
    const [skills, vibes] = await Promise.all([
      prisma.peerRating.count({
        where: { seasonId: season.id, raterId: user.id },
      }),
      prisma.vibeVote.count({
        where: { seasonId: season.id, voterId: user.id },
      }),
    ]);
    const total = students.length;
    await sendTelegramMessage(
      chatId,
      `🗳 Голосование (live)\n\nОценили силу: <b>${skills}/${total}</b>\nТильт: <b>${vibes}/${total}</b>\n\nОткройте сайт → Голосование.`,
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
        await castMvpVote({
          sessionId,
          voterId: voter.id,
          nomineeId,
        });
        await answerCallbackQuery(cq.id, "Голос за MVP принят");
        await sendTelegramMessage(chatId, "✅ Голос за MVP учтён. Спасибо!");
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
        "❌ Ссылка для входа устарела. Нажмите «Войти через бота» на сайте ещё раз."
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

  const url = new URL(`https://api.telegram.org/bot${token}/getUpdates`);
  url.searchParams.set("timeout", "30");
  if (offset) url.searchParams.set("offset", String(offset));

  const res = await fetch(url.toString());
  if (!res.ok) return [];

  const data = await res.json();
  return (data.result || []) as TelegramUpdate[];
}
