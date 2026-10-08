import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import {
  adminKickParticipant,
  adminMoveParticipant,
  adminMuteParticipant,
  isLivekitConfigured,
} from "@/lib/livekit";
import { isVoiceRoomId } from "@/lib/voice-rooms";

type ActionBody =
  | { action: "mute"; roomId: string; identity: string; muted: boolean }
  | { action: "kick"; roomId: string; identity: string }
  | { action: "move"; fromRoomId: string; toRoomId: string; identity: string };

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isLivekitConfigured()) {
    return NextResponse.json({ error: "LiveKit не настроен" }, { status: 503 });
  }

  let body: ActionBody;
  try {
    body = (await request.json()) as ActionBody;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  try {
    if (body.action === "mute") {
      if (!isVoiceRoomId(body.roomId) || !body.identity) {
        return NextResponse.json({ error: "Bad request" }, { status: 400 });
      }
      await adminMuteParticipant(body.roomId, body.identity, Boolean(body.muted));
      return NextResponse.json({ ok: true });
    }
    if (body.action === "kick") {
      if (!isVoiceRoomId(body.roomId) || !body.identity) {
        return NextResponse.json({ error: "Bad request" }, { status: 400 });
      }
      await adminKickParticipant(body.roomId, body.identity);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "move") {
      if (
        !isVoiceRoomId(body.fromRoomId) ||
        !isVoiceRoomId(body.toRoomId) ||
        !body.identity
      ) {
        return NextResponse.json({ error: "Bad request" }, { status: 400 });
      }
      await adminMoveParticipant(body.fromRoomId, body.identity, body.toRoomId);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "ROOM_FULL") {
      return NextResponse.json({ error: "Целевая комната заполнена" }, { status: 409 });
    }
    console.error("[voice/admin]", e);
    return NextResponse.json({ error: "Операция не выполнена" }, { status: 500 });
  }
}
