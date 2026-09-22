import { NextRequest, NextResponse } from "next/server";
import { runAutomation } from "@/lib/automation";

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";

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

export async function GET(request: NextRequest) {
  return POST(request);
}
