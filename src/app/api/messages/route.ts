import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { displayName } from "@/lib/utils";
import { sendTelegramMessage, notifyChatId } from "@/lib/telegram";

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
  // Student: peer is always the coach (configured admin)
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
  const { recipientId, body } = await request.json();

  if (!body?.trim()) {
    return NextResponse.json({ error: "Пустое сообщение" }, { status: 400 });
  }

  const peer = await resolvePeer(me.role, recipientId);
  if (!peer) {
    return NextResponse.json({ error: "Получатель не найден" }, { status: 404 });
  }

  const message = await prisma.message.create({
    data: { senderId: me.id, recipientId: peer.id, body: body.trim() },
  });

  await sendTelegramMessage(
    notifyChatId(peer),
    `💬 <b>Новое сообщение от ${displayName(me)}</b>\n\n${body.trim()}\n\nОтветить можно на сайте.`
  );

  return NextResponse.json({ message });
}
