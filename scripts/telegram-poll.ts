import { prisma } from "../src/lib/db";
import { fetchTelegramUpdates, handleTelegramUpdate } from "../src/lib/telegram-bot";

async function poll() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token === "dev-token") {
    console.error("TELEGRAM_BOT_TOKEN не настроен в .env");
    process.exit(1);
  }

  console.log("Telegram polling started. Нажмите Ctrl+C для остановки.");
  let offset: number | undefined;

  while (true) {
    try {
      const updates = await fetchTelegramUpdates(offset);
      for (const update of updates) {
        await handleTelegramUpdate(update);
        offset = update.update_id + 1;
      }
    } catch (error) {
      console.error("Polling error:", error);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

poll().finally(async () => {
  await prisma.$disconnect();
});
