import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { extractSteamIdFromInput, fetchOpenDotaSummary } from "@/lib/opendota";

export async function GET(request: NextRequest) {
  await requireUser();
  const accountId = request.nextUrl.searchParams.get("accountId");
  if (!accountId) {
    return NextResponse.json({ error: "accountId обязателен" }, { status: 400 });
  }

  const id = extractSteamIdFromInput(accountId);
  if (!id) {
    return NextResponse.json({ error: "Некорректный ID" }, { status: 400 });
  }

  const summary = await fetchOpenDotaSummary(id);
  if (!summary) {
    return NextResponse.json({ error: "Игрок не найден в OpenDota" }, { status: 404 });
  }

  return NextResponse.json(summary);
}
