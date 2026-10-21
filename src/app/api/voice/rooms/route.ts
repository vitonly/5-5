import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { isLivekitConfigured, listVoiceRooms } from "@/lib/livekit";
import { handleAuth } from "@/lib/api-auth";

async function getHandler() {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rooms = await listVoiceRooms();
    return NextResponse.json({
      configured: isLivekitConfigured(),
      rooms,
    });
  } catch (e) {
    console.error("[voice/rooms]", e);
    return NextResponse.json({
      configured: isLivekitConfigured(),
      rooms: [],
      error: "Не удалось получить список комнат",
    });
  }
}

// Нет входа / нет прав — ответ 401 / 403, а не «ошибка сервера»
export const GET = handleAuth(getHandler);
