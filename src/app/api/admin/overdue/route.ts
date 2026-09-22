import { NextResponse } from "next/server";
import { processOverdueHomework } from "@/lib/automation";
import { requireAdmin } from "@/lib/session";

export async function POST() {
  await requireAdmin();
  const count = await processOverdueHomework();
  return NextResponse.json({ processed: count });
}
