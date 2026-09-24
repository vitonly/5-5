export type InlineKeyboardButton = {
  text: string;
  callback_data: string;
};

export type InlineKeyboard = {
  inline_keyboard: InlineKeyboardButton[][];
};

export type TelegramSendResult = {
  ok: boolean;
  messageId?: number;
};

async function telegramApi(method: string, body: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token === "dev-token") {
    return { ok: false as const, data: null };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok && Boolean(data?.ok), data };
  } catch {
    return { ok: false as const, data: null };
  }
}

export async function sendTelegramMessageDetailed(
  chatId: string | null | undefined,
  text: string,
  replyMarkup?: InlineKeyboard
): Promise<TelegramSendResult> {
  if (!chatId) return { ok: false };

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (replyMarkup) body.reply_markup = replyMarkup;

  const { ok, data } = await telegramApi("sendMessage", body);
  return {
    ok,
    messageId: typeof data?.result?.message_id === "number" ? data.result.message_id : undefined,
  };
}

export async function sendTelegramMessage(
  chatId: string | null | undefined,
  text: string,
  replyMarkup?: InlineKeyboard
): Promise<boolean> {
  const result = await sendTelegramMessageDetailed(chatId, text, replyMarkup);
  return result.ok;
}

export async function editTelegramMessage(
  chatId: string | null | undefined,
  messageId: number | null | undefined,
  text: string,
  replyMarkup?: InlineKeyboard | null
): Promise<boolean> {
  if (!chatId || messageId == null) return false;

  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (replyMarkup === null) {
    body.reply_markup = { inline_keyboard: [] };
  } else if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }

  const { ok } = await telegramApi("editMessageText", body);
  return ok;
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
  showAlert = false
): Promise<boolean> {
  const body: Record<string, unknown> = { callback_query_id: callbackQueryId };
  if (text) body.text = text;
  if (showAlert) body.show_alert = true;
  const { ok } = await telegramApi("answerCallbackQuery", body);
  return ok;
}

export function notifyChatId(user: {
  telegramChatId?: string | null;
  telegramId?: string | null;
}) {
  return user.telegramChatId || null;
}
