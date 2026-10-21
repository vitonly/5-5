import { NextResponse } from "next/server";
import { processOverdueHomework } from "@/lib/automation";
import { requireAdmin } from "@/lib/session";
import { handleAuth } from "@/lib/api-auth";

async function postHandler() {
  await requireAdmin();
  const count = await processOverdueHomework();
  return NextResponse.json({ processed: count });
}

// Нет входа / нет прав — ответ 401 / 403, а не «ошибка сервера»
export const POST = handleAuth(postHandler);
