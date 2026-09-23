import { prisma } from "@/lib/db";
import { isAdminTelegramId } from "@/lib/session";
import { sendTelegramMessage } from "@/lib/telegram";
import { upsertTelegramUser } from "@/lib/telegram-auth";

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

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

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

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const message = update.message;
  if (!message?.text || !message.from) return;

  const chatId = String(message.chat.id);
  const text = message.text.trim();

  if (!text.startsWith("/start")) return;

  const param = text.split(/\s+/)[1];

  if (param?.startsWith("login_")) {
    const token = param.slice(6);
    const ok = await completeWebLogin(token, message.from, chatId);
    if (ok) {
      await sendTelegramMessage(
        chatId,
        "✅ Вход подтверждён! Вернитесь на сайт — страница обновится сама."
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
        "✅ Telegram привязан! Теперь вы будете получать уведомления о домашках и сообщениях."
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
      "✅ Бот подключён! Вы будете получать уведомления о домашках и сообщениях."
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
