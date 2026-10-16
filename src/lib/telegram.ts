import { existsSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";
import { telegramBotUrl, telegramProxyHeaders } from "@/lib/telegram-api";

export type InlineKeyboardButton = {
  text: string;
  callback_data: string;
};

export type InlineKeyboard = {
  inline_keyboard: InlineKeyboardButton[][];
};

export type ReplyKeyboard = {
  keyboard: { text: string }[][];
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
};

export type TelegramKeyboard = InlineKeyboard | ReplyKeyboard;

export type TelegramSendResult = {
  ok: boolean;
  messageId?: number;
};

function uploadsDir(): string {
  return (
    process.env.UPLOADS_DIR?.trim() || path.join(process.cwd(), "public", "uploads")
  );
}

/** Локальный путь к /uploads/... — Telegram часто не может скачать URL с нашего VPS. */
export function localUploadPath(url: string | null | undefined): string | null {
  if (!url) return null;
  let pathname = url.trim();
  try {
    if (/^https?:\/\//i.test(pathname)) {
      pathname = new URL(pathname).pathname;
    }
  } catch {
    return null;
  }
  if (!pathname.startsWith("/uploads/")) return null;
  const name = path.basename(pathname);
  if (!name || name === "." || name.includes("..")) return null;
  const full = path.join(uploadsDir(), name);
  return existsSync(full) ? full : null;
}

function guessMime(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

async function telegramApi(method: string, body: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token === "dev-token") {
    return { ok: false as const, data: null };
  }

  try {
    const res = await fetch(telegramBotUrl(token, method), {
      method: "POST",
      headers: telegramProxyHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok && Boolean(data?.ok), data };
  } catch {
    return { ok: false as const, data: null };
  }
}

async function telegramApiMultipart(
  method: string,
  fields: Record<string, string>,
  file: {
    field: string;
    filename: string;
    buffer: Buffer;
    contentType: string;
  }
) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token === "dev-token") {
    return { ok: false as const, data: null };
  }

  try {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      form.append(key, value);
    }
    form.append(
      file.field,
      new Blob([new Uint8Array(file.buffer)], { type: file.contentType }),
      file.filename
    );

    const res = await fetch(telegramBotUrl(token, method), {
      method: "POST",
      headers: telegramProxyHeaders(),
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok && Boolean(data?.ok), data };
  } catch {
    return { ok: false as const, data: null };
  }
}

/** Абсолютный URL для Telegram (локальные /uploads → NEXT_PUBLIC_APP_URL). */
export function absolutePublicUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "";
  if (!base) return null;
  return `${base}${url.startsWith("/") ? url : `/${url}`}`;
}

export async function sendTelegramMessageDetailed(
  chatId: string | null | undefined,
  text: string,
  replyMarkup?: TelegramKeyboard
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

/** Текст + опциональное фото (caption ≤ 1024). Файл шлём multipart с диска — URL Telegram часто не тянет. */
export async function sendTelegramInviteDetailed(
  chatId: string | null | undefined,
  text: string,
  replyMarkup?: InlineKeyboard,
  imageUrl?: string | null
): Promise<TelegramSendResult> {
  if (!chatId) return { ok: false };
  if (!imageUrl) {
    return sendTelegramMessageDetailed(chatId, text, replyMarkup);
  }

  const caption = text.length > 1024 ? `${text.slice(0, 1020)}…` : text;
  const fields: Record<string, string> = {
    chat_id: String(chatId),
    caption,
    parse_mode: "HTML",
  };
  if (replyMarkup) fields.reply_markup = JSON.stringify(replyMarkup);

  const localPath = localUploadPath(imageUrl);
  if (localPath) {
    try {
      const buffer = await readFile(localPath);
      const filename = path.basename(localPath);
      const isGif = path.extname(filename).toLowerCase() === ".gif";
      const { ok, data } = await telegramApiMultipart(
        isGif ? "sendAnimation" : "sendPhoto",
        fields,
        {
          field: isGif ? "animation" : "photo",
          filename,
          buffer,
          contentType: guessMime(filename),
        }
      );
      if (ok) {
        return {
          ok: true,
          messageId:
            typeof data?.result?.message_id === "number"
              ? data.result.message_id
              : undefined,
        };
      }
    } catch {
      /* fall through */
    }
  }

  const photo = absolutePublicUrl(imageUrl);
  if (photo) {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      photo,
      caption,
      parse_mode: "HTML",
    };
    if (replyMarkup) body.reply_markup = replyMarkup;
    const { ok, data } = await telegramApi("sendPhoto", body);
    if (ok) {
      return {
        ok: true,
        messageId:
          typeof data?.result?.message_id === "number"
            ? data.result.message_id
            : undefined,
      };
    }
  }

  return sendTelegramMessageDetailed(chatId, text, replyMarkup);
}

export async function sendTelegramMessage(
  chatId: string | null | undefined,
  text: string,
  replyMarkup?: TelegramKeyboard
): Promise<boolean> {
  const result = await sendTelegramMessageDetailed(chatId, text, replyMarkup);
  return result.ok;
}

/** Отправить PNG/JPEG из буфера (итоги дня и т.п.). */
export async function sendTelegramPhotoBuffer(
  chatId: string | null | undefined,
  buffer: Buffer,
  filename: string,
  caption?: string,
  replyMarkup?: InlineKeyboard
): Promise<TelegramSendResult> {
  if (!chatId || !buffer.length) return { ok: false };
  const fields: Record<string, string> = {
    chat_id: String(chatId),
    parse_mode: "HTML",
  };
  if (caption) {
    fields.caption = caption.length > 1024 ? `${caption.slice(0, 1020)}…` : caption;
  }
  if (replyMarkup) fields.reply_markup = JSON.stringify(replyMarkup);
  const { ok, data } = await telegramApiMultipart("sendPhoto", fields, {
    field: "photo",
    filename,
    buffer,
    contentType: guessMime(filename),
  });
  return {
    ok,
    messageId: typeof data?.result?.message_id === "number" ? data.result.message_id : undefined,
  };
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

export async function editTelegramCaption(
  chatId: string | null | undefined,
  messageId: number | null | undefined,
  caption: string,
  replyMarkup?: InlineKeyboard | null
): Promise<boolean> {
  if (!chatId || messageId == null) return false;

  const text = caption.length > 1024 ? `${caption.slice(0, 1020)}…` : caption;
  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    caption: text,
    parse_mode: "HTML",
  };
  if (replyMarkup === null) {
    body.reply_markup = { inline_keyboard: [] };
  } else if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }

  const { ok } = await telegramApi("editMessageCaption", body);
  return ok;
}

/** Правит текст или caption — смотря было ли фото в инвайте. */
export async function editTelegramInviteMessage(
  chatId: string | null | undefined,
  messageId: number | null | undefined,
  text: string,
  replyMarkup?: InlineKeyboard | null,
  hadPhoto?: boolean
): Promise<boolean> {
  if (hadPhoto) {
    const ok = await editTelegramCaption(chatId, messageId, text, replyMarkup);
    if (ok) return true;
  }
  return editTelegramMessage(chatId, messageId, text, replyMarkup);
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
  // У личных чатов chat_id обычно совпадает с telegramId
  return user.telegramChatId || user.telegramId || null;
}
