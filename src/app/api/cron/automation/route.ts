import { NextRequest, NextResponse } from "next/server";
import { runAutomation } from "@/lib/automation";

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Локально без секрета — ок; на проде без CRON_SECRET не пускаем.
    return process.env.NODE_ENV !== "production";
  }

  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;

  // Ручной вызов / локальный скрипт
  const header = request.headers.get("x-cron-secret");
  const query = request.nextUrl.searchParams.get("secret");
  return header === secret || query === secret;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runAutomation();
  return NextResponse.json(result);
}

/** Vercel Cron вызывает GET. */
export async function GET(request: NextRequest) {
  return POST(request);
}
