import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { runAutomation } from "@/lib/automation";

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Локально без секрета — ок; на проде без CRON_SECRET не пускаем.
    return process.env.NODE_ENV !== "production";
  }

  // Секрет — только в заголовке. В адресе (?secret=…) больше не принимаем:
  // адреса попадают в логи nginx и историю браузера
  const auth = request.headers.get("authorization") || "";
  const header = request.headers.get("x-cron-secret") || "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7) : header;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
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
