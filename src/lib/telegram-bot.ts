import { prisma } from "@/lib/db";
import { isAdminTelegramId } from "@/lib/session";
import { sendTelegramMessage } from "@/lib/telegram";

type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
};

type TelegramMessage = {
  message_id: number;
  from: TelegramUser;
  chat: { id: number; type: string };
  text?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

async function linkByTelegramId(from: TelegramUser, chatId: string) {
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
    const admin = await prisma.user.upsert({
      where: { telegramId },
      update: {
        telegramChatId: chatId,
        firstName: from.first_name,
        lastName: from.last_name || null,
        username: from.username || null,
        role: "ADMIN",
      },
      create: {
        telegramId,
        telegramChatId: chatId,
        firstName: from.first_name,
        lastName: from.last_name || null,
        username: from.username || null,
        role: "ADMIN",
        profile: { create: {} },
      },
    });
    return admin.id;
  }

  return null;
}

async function linkByToken(token: string, from: TelegramUser, chatId: string) {
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

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const message = update.message;
  if (!message?.text || !message.from) return;

  const chatId = String(message.chat.id);
  const text = message.text.trim();

  if (!text.startsWith("/start")) return;

  const param = text.split(/\s+/)[1];

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

    await sendTelegramMessage(chatId, "❌ Ссылка для привязки недействительна. Получите новую в профиле на сайте.");
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
    "👋 Привет! Чтобы получать уведомления, войдите на сайт и нажмите «Привязать Telegram» в профиле."
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
