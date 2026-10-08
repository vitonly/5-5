import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { isLivekitConfigured, listVoiceRooms } from "@/lib/livekit";

export async function GET() {
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
