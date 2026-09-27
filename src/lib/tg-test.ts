import { prisma } from "@/lib/db";
import { notifyChatId, sendTelegramMessage } from "@/lib/telegram";

/** Отправить текст только админу (для превью TG-уведомлений). */
export async function sendTelegramTestToAdmin(adminUserId: string, text: string) {
  const admin = await prisma.user.findUnique({ where: { id: adminUserId } });
  if (!admin) throw new Error("Админ не найден");
  const chatId = notifyChatId(admin);
  if (!chatId) {
    throw new Error("Привяжите Telegram в профиле, чтобы получать тест-уведомления");
  }
  const preview = `🧪 <b>Тест-уведомление</b>\n\n${text}`;
  const ok = await sendTelegramMessage(chatId, preview);
  if (!ok) throw new Error("Не удалось отправить в Telegram");
  return true;
}
