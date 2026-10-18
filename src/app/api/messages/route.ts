import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { displayName } from "@/lib/utils";
import {
  notifyChatId,
  sendTelegramInviteDetailed,
  sendTelegramMessage,
  escapeTelegramHtml,
} from "@/lib/telegram";

async function getCoach() {
  const ids = (process.env.ADMIN_TELEGRAM_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length > 0) {
    const configured = await prisma.user.findFirst({
      where: { role: "ADMIN", telegramId: { in: ids } },
      orderBy: { createdAt: "asc" },
    });
    if (configured) return configured;
  }
  return prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
}

async function resolvePeer(meRole: string, peerId?: string | null) {
  if (meRole === "ADMIN") {
    if (!peerId) return null;
    return prisma.user.findUnique({ where: { id: peerId } });
  }
  return getCoach();
}

export async function GET(request: NextRequest) {
  const me = await requireUser();
  const peerId = request.nextUrl.searchParams.get("peerId");

  const peer = await resolvePeer(me.role, peerId);
  if (!peer) {
    return NextResponse.json({ messages: [], peer: null });
  }

  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: me.id, recipientId: peer.id },
        { senderId: peer.id, recipientId: me.id },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  await prisma.message.updateMany({
    where: { senderId: peer.id, recipientId: me.id, read: false },
    data: { read: true },
  });

  return NextResponse.json({
    messages,
    peer: { id: peer.id, name: displayName(peer) },
  });
}

export async function POST(request: NextRequest) {
  const me = await requireUser();
  const { recipientId, body, imageUrl } = await request.json();

  const text = typeof body === "string" ? body.trim() : "";
  const image = typeof imageUrl === "string" && imageUrl.trim() ? imageUrl.trim() : null;
  // Фото в чате — только из наших загрузок
  if (image && !/^\/uploads\/[A-Za-z0-9._-]+$/.test(image)) {
    return NextResponse.json({ error: "Некорректное фото" }, { status: 400 });
  }

  if (!text && !image) {
    return NextResponse.json({ error: "Пустое сообщение" }, { status: 400 });
  }

  const peer = await resolvePeer(me.role, recipientId);
  if (!peer) {
    return NextResponse.json({ error: "Получатель не найден" }, { status: 404 });
  }

  const message = await prisma.message.create({
    data: {
      senderId: me.id,
      recipientId: peer.id,
      body: text || (image ? "📷 Фото" : ""),
      imageUrl: image,
    },
  });

  // Имя и текст экранируем: иначе в уведомление можно вставить свою разметку и ссылки
  const notifyText = `💬 <b>Новое сообщение от ${escapeTelegramHtml(displayName(me))}</b>\n\n${escapeTelegramHtml(
    text || "📷 Фото"
  )}\n\nОтветить можно на сайте.`;

  // Не блокируем ответ клиенту ожиданием Telegram
  void (async () => {
    try {
      if (image) {
        const sent = await sendTelegramInviteDetailed(
          notifyChatId(peer),
          notifyText,
          undefined,
          image
        );
        if (!sent.ok) {
          await sendTelegramMessage(notifyChatId(peer), `${notifyText}\n${image}`);
        }
      } else {
        await sendTelegramMessage(notifyChatId(peer), notifyText);
      }
    } catch {
      /* ignore notify errors */
    }
  })();

  return NextResponse.json({ message });
}
