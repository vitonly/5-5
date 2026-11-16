/*
 * Полигон: сохранить или сдать свою попытку.
 * PUT { files?: [{name,url}], textAnswer?: string, workbook?: object, submit?: boolean }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { handleAuth } from "@/lib/api-auth";
import { canUsePoligon, getModule, getVariant, parseFiles, type AttemptFile } from "@/lib/poligon/core";
import { parseWorkbook } from "@/lib/poligon/a-practicum";
import { isBPractice, reviewBPractice } from "@/lib/poligon/b-practice";
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
  if (!canUsePoligon(user)) return NextResponse.json({ error: "Раздел «Профессионалы» тебе пока не открыт" }, { status: 403 });
  const { id } = await params;
  const attempt = await prisma.poligonAttempt.findUnique({ where: { id } });
  if (!attempt || attempt.userId !== user.id) return NextResponse.json({ error: "Попытка не найдена" }, { status: 404 });
  if (attempt.status !== "IN_PROGRESS") return NextResponse.json({ error: "Попытка уже сдана" }, { status: 409 });
  const official = attempt.variantId === "b-official-two-day";
  const savedWorkbook = parseWorkbook(attempt.workbook);
  if (official && savedWorkbook._b_day === "break") {
    return NextResponse.json({ error: "Между днями работу сохранять нельзя" }, { status: 409 });
  }
  if (isHardClosed(attempt.mode, attempt.deadlineAt)) {
    return NextResponse.json({ error: "Время вышло — как на чемпионате, сдать уже нельзя" }, { status: 403 });
  }

  const raw: unknown = await request.json().catch(() => null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "Нужен JSON-объект" }, { status: 400 });
  }
  const body = raw as {
    files?: unknown;
    textAnswer?: unknown;
    workbook?: unknown;
    submit?: unknown;
  };
  const files = body.files === undefined ? null : cleanFiles(body.files);
  const practice = isBPractice(attempt.variantId);
  const protectedWorkbook = practice || official;
  // Удаление, замена или переименование файлов делает прежние факты неактуальными.
  const filesChanged = files !== null && JSON.stringify(files) !== JSON.stringify(parseFiles(attempt.fileUrls));
  if (protectedWorkbook && filesChanged) delete savedWorkbook._b_filecheck;
  const data: { fileUrls?: string; textAnswer?: string; workbook?: string; status?: string; submittedAt?: Date } = {};
  if (files) data.fileUrls = JSON.stringify(files);
  if (typeof body.textAnswer === "string") data.textAnswer = body.textAnswer.slice(0, 20_000);
  // Тетрадь: только простой объект «поле → строка/да-нет», не больше 300 КБ
  if (body.workbook && typeof body.workbook === "object" && !Array.isArray(body.workbook)) {
    const clean: Record<string, string | boolean> = protectedWorkbook ? { ...savedWorkbook } : {};
    for (const [k, v] of Object.entries(body.workbook as Record<string, unknown>).slice(0, 500)) {
      if (!/^[a-z0-9_-]{1,32}$/i.test(k)) continue;
      // Служебные поля задаёт только сервер, включая ещё не созданные ключи.
      if (protectedWorkbook && k.startsWith("_b_")) continue;
      if (typeof v === "boolean") clean[k] = v;
      else if (typeof v === "string" || typeof v === "number") clean[k] = String(v).slice(0, 10_000);
    }
    const json = JSON.stringify(clean);
    if (json.length > 300_000) return NextResponse.json({ error: "Слишком много текста в тетради" }, { status: 413 });
    data.workbook = json;
  }
  if (protectedWorkbook && filesChanged && data.workbook === undefined) {
    data.workbook = JSON.stringify(savedWorkbook);
  }

  const submit = body.submit === true;
  if (submit) {
    if (official && savedWorkbook._b_day !== "2") {
      return NextResponse.json({ error: "Сдать работу можно только во второй день" }, { status: 409 });
    }
    const submittedFiles = files ?? parseFiles(attempt.fileUrls);
    const count = submittedFiles.length;
    const workbook = data.workbook ? parseWorkbook(data.workbook) : savedWorkbook;
    if (practice) {
      // Самостоятельные отчёты требуют реальных файлов, а не отметки ученика.
      const needsXlsx = workbook._b_mode !== "guided"
        && ["b-practice-clean", "b-practice-report", "b-practice-visual", "b-practice-full"].includes(attempt.variantId);
      const needsPptx = ["b-practice-visual", "b-practice-full"].includes(attempt.variantId);
      const hasOffice = (ext: string) => submittedFiles.some((file) =>
        /^\/uploads\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(file.url)
        && !file.url.includes("..") && file.url.toLowerCase().endsWith(`.${ext}`));
      if (needsXlsx && (!hasOffice("xlsx")
        || (needsPptx && !hasOffice("pptx")))) {
        return NextResponse.json({ error: "Загрузи обработанные данные или отчёт .xlsx и, для визуализации или полного прогона, презентацию .pptx" }, { status: 400 });
      }
      // Фиксируем серверный разбор без пользовательских оценок; после сдачи он неизменяем.
      workbook._b_report = JSON.stringify(reviewBPractice(attempt.variantId, workbook));
      data.workbook = JSON.stringify(workbook);
    }
    // В задании с тетрадью результат — сама тетрадь, файлы не обязательны
    const mod = getModule(attempt.moduleCode);
    const hasWorkbook = !!(mod && getVariant(mod, attempt.variantId)?.workbook);
    if (!count && !hasWorkbook) return NextResponse.json({ error: "Сначала загрузи хотя бы один файл" }, { status: 400 });
    data.status = "SUBMITTED";
    data.submittedAt = new Date();
  }

  // Не даём параллельному сохранению перетереть сдачу или новую версию тетради.
  const updated = await prisma.poligonAttempt.updateMany({
    where: { id, status: "IN_PROGRESS", updatedAt: attempt.updatedAt, workbook: attempt.workbook, fileUrls: attempt.fileUrls }, data,
  });
  if (!updated.count) return NextResponse.json({ error: "Попытка уже изменена. Обнови страницу" }, { status: 409 });

  // Тренеру — сообщение в Telegram, что пришла работа на проверку
  if (submit) {
    const mod = getModule(attempt.moduleCode);
    const variant = mod ? getVariant(mod, attempt.variantId) : null;
    const coaches = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { telegramChatId: true, telegramId: true },
    });
    const text =
      `🧪 Профессионалы: ${escapeTelegramHtml(`${user.firstName} ${user.lastName ?? ""}`.trim())} сдал(а) задание\n` +
      `<b>${escapeTelegramHtml(`Модуль ${mod?.letter ?? ""} — ${variant?.title ?? attempt.variantId}`)}</b>\n` +
      `Проверить: ${absolutePublicUrl(`/admin/poligon/attempt/${id}`) ?? `/admin/poligon/attempt/${id}`}`;
    await Promise.all(coaches.map((c) => sendTelegramMessage(notifyChatId(c), text).catch(() => false)));
  }

  return NextResponse.json({ ok: true });
}

export const PUT = handleAuth(putHandler);
