import { NextResponse } from "next/server";
import { getLiveStreamsFromMaterials } from "@/lib/materials-live";
import { getSessionUser } from "@/lib/session";

/** Live-статус стримов для клиентской подгрузки (не блокирует SSR). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const live = await getLiveStreamsFromMaterials();
    return NextResponse.json(live, {
      headers: { "Cache-Control": "private, max-age=30" },
    });
  } catch (e) {
    console.error("[streams/live]", e);
    return NextResponse.json({ liveStreams: [], liveLogins: [] });
  }
}
