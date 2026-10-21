import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { createVoiceToken, isLivekitConfigured } from "@/lib/livekit";
import { isVoiceRoomId } from "@/lib/voice-rooms";
import { handleAuth } from "@/lib/api-auth";

async function postHandler(request: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isLivekitConfigured()) {
    return NextResponse.json(
      { error: "Голосовой чат ещё не настроен на сервере" },
      { status: 503 }
    );
  }

  let body: { roomId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const roomId = body.roomId?.trim() ?? "";
  if (!isVoiceRoomId(roomId)) {
    return NextResponse.json({ error: "Неизвестная комната" }, { status: 400 });
  }

  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.username ||
    "Игрок";

  try {
    const result = await createVoiceToken({
      userId: user.id,
      displayName,
      roomId,
      isAdmin: user.role === "ADMIN",
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "ROOM_FULL") {
      return NextResponse.json({ error: "Комната заполнена (макс. 5)" }, { status: 409 });
    }
    console.error("[voice/token]", e);
    return NextResponse.json({ error: "Не удалось войти в комнату" }, { status: 500 });
  }
}

// Нет входа / нет прав — ответ 401 / 403, а не «ошибка сервера»
export const POST = handleAuth(postHandler);
