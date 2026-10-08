import { prisma } from "@/lib/db";
import {
  notifyChatId,
  sendTelegramInviteDetailed,
  sendTelegramMessage,
  type InlineKeyboard,
} from "@/lib/telegram";

/** Отправить текст только админу (для превью TG-уведомлений). */
export async function sendTelegramTestToAdmin(
  adminUserId: string,
  text: string,
  opts?: { photoUrl?: string | null; keyboard?: InlineKeyboard }
) {
  const admin = await prisma.user.findUnique({ where: { id: adminUserId } });
  if (!admin) throw new Error("Админ не найден");
  const chatId = notifyChatId(admin);
  if (!chatId) {
    throw new Error("Привяжите Telegram в профиле, чтобы получать тест-уведомления");
  }
  const preview = `🧪 <b>Тест-уведомление</b>\n\n${text}`;
  if (opts?.photoUrl || opts?.keyboard) {
    const sent = await sendTelegramInviteDetailed(
      chatId,
      preview,
      opts.keyboard,
      opts.photoUrl
    );
    if (!sent.ok) throw new Error("Не удалось отправить в Telegram");
    return true;
  }
  const ok = await sendTelegramMessage(chatId, preview);
  if (!ok) throw new Error("Не удалось отправить в Telegram");
  return true;
}
