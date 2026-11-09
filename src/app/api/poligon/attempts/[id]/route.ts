/*
 * Полигон: сохранить или сдать свою попытку.
 * PUT { files?: [{name,url}], textAnswer?: string, workbook?: object, submit?: boolean }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { handleAuth } from "@/lib/api-auth";
import { getModule, getVariant, type AttemptFile } from "@/lib/poligon/core";
import { isHardClosed } from "@/lib/poligon/server";
import { absolutePublicUrl, escapeTelegramHtml, notifyChatId, sendTelegramMessage } from "@/lib/telegram";

/** Принимаем только файлы, загруженные на наш сайт */
function cleanFiles(raw: unknown): AttemptFile[] | null {
  if (!Array.isArray(raw)) return null;
  return raw
    .filter((f) => f && typeof f.url === "string" && f.url.startsWith("/uploads/") && !f.url.includes(".."))
    .slice(0, 20)
    .map((f) => ({ name: String(f.name ?? "файл").slice(0, 200), url: String(f.url) }));
}

async function putHandler(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const attempt = await prisma.poligonAttempt.findUnique({ where: { id } });
  if (!attempt || attempt.userId !== user.id) return NextResponse.json({ error: "Попытка не найдена" }, { status: 404 });
  if (attempt.status !== "IN_PROGRESS") return NextResponse.json({ error: "Попытка уже сдана" }, { status: 409 });
  if (isHardClosed(attempt.mode, attempt.deadlineAt)) {
    return NextResponse.json({ error: "Время вышло — как на чемпионате, сдать уже нельзя" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    files?: unknown;
    textAnswer?: unknown;
    workbook?: unknown;
    submit?: unknown;
  };
  const files = body.files === undefined ? null : cleanFiles(body.files);
  const data: { fileUrls?: string; textAnswer?: string; workbook?: string; status?: string; submittedAt?: Date } = {};
  if (files) data.fileUrls = JSON.stringify(files);
  if (typeof body.textAnswer === "string") data.textAnswer = body.textAnswer.slice(0, 20_000);
  // Тетрадь: только простой объект «поле → строка/да-нет», не больше 300 КБ
  if (body.workbook && typeof body.workbook === "object" && !Array.isArray(body.workbook)) {
    const clean: Record<string, string | boolean> = {};
    for (const [k, v] of Object.entries(body.workbook as Record<string, unknown>).slice(0, 500)) {
      if (!/^[a-z0-9_]{1,24}$/i.test(k)) continue;
      if (typeof v === "boolean") clean[k] = v;
      else if (typeof v === "string" || typeof v === "number") clean[k] = String(v).slice(0, 10_000);
    }
    const json = JSON.stringify(clean);
    if (json.length > 300_000) return NextResponse.json({ error: "Слишком много текста в тетради" }, { status: 413 });
    data.workbook = json;
  }

  const submit = body.submit === true;
  if (submit) {
    const count = files ? files.length : JSON.parse(attempt.fileUrls || "[]").length;
    // В задании с тетрадью результат — сама тетрадь, файлы не обязательны
    const mod = getModule(attempt.moduleCode);
    const hasWorkbook = !!(mod && getVariant(mod, attempt.variantId)?.workbook);
    if (!count && !hasWorkbook) return NextResponse.json({ error: "Сначала загрузи хотя бы один файл" }, { status: 400 });
    data.status = "SUBMITTED";
    data.submittedAt = new Date();
  }

  await prisma.poligonAttempt.update({ where: { id }, data });

  // Тренеру — сообщение в Telegram, что пришла работа на проверку
  if (submit) {
    const mod = getModule(attempt.moduleCode);
    const variant = mod ? getVariant(mod, attempt.variantId) : null;
    const coaches = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { telegramChatId: true, telegramId: true },
    });
    const text =
      `🧪 Полигон: ${escapeTelegramHtml(`${user.firstName} ${user.lastName ?? ""}`.trim())} сдал(а) задание\n` +
      `<b>${escapeTelegramHtml(`Модуль ${mod?.letter ?? ""} — ${variant?.title ?? attempt.variantId}`)}</b>\n` +
      `Проверить: ${absolutePublicUrl(`/admin/poligon/attempt/${id}`) ?? `/admin/poligon/attempt/${id}`}`;
    await Promise.all(coaches.map((c) => sendTelegramMessage(notifyChatId(c), text).catch(() => false)));
  }

  return NextResponse.json({ ok: true });
}

export const PUT = handleAuth(putHandler);
