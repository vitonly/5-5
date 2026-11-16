/* Проверка Office возвращает только факты и никогда не начисляет баллы. */
import { NextRequest, NextResponse } from "next/server";
import { open, realpath } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { handleAuth } from "@/lib/api-auth";
import { hit, retryAfterSec } from "@/lib/rate-limit";
import { canUsePoligon, parseFiles, type AttemptFile } from "@/lib/poligon/core";
import { parseWorkbook } from "@/lib/poligon/a-practicum";
import { isBPractice } from "@/lib/poligon/b-practice";
import { inspectBXlsx, inspectBPptx } from "@/lib/poligon/b-office";

export const runtime = "nodejs";
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_FACTS_BYTES = 100_000;
type Requirement = { label: string; ok: boolean | null; feedback: string };

// Это свойства загруженного файла, отдельно от проверки ответов в тетради.
function fileRequirements(variantId: string, facts: {
  pivots?: unknown[]; chartTypes?: string[]; count?: number; aspect16by9?: boolean | null;
}): Requirement[] {
  const requirements: Requirement[] = [];
  if (facts.pivots && ["b-practice-report", "b-practice-full"].includes(variantId)) {
    requirements.push({ label: "Не менее трёх сводных таблиц в XLSX", ok: facts.pivots.length >= 3,
      feedback: `Найдено частей сводных: ${facts.pivots.length}. Наличие частей не подтверждает правильность расчётов.` });
  }
  if (facts.chartTypes && ["b-practice-visual", "b-practice-full"].includes(variantId)) {
    requirements.push({ label: "Не менее двух типов диаграмм в XLSX", ok: new Set(facts.chartTypes).size >= 2,
      feedback: `Найдено разных типов: ${new Set(facts.chartTypes).size}. Выбор типа и читаемость проверит наставник.` });
  }
  if (facts.count !== undefined) {
    requirements.push({ label: "Ровно пять слайдов", ok: facts.count === 5, feedback: `В файле ${facts.count} слайдов.` });
    requirements.push({ label: "Формат слайда 16:9", ok: facts.aspect16by9 === true,
      feedback: facts.aspect16by9 === true ? "В файле указан размер 16:9." : "Размер 16:9 не подтверждён файлом." });
  }
  requirements.push({ label: "Смысл выводов и достоверность данных файла", ok: null,
    feedback: "Ожидает проверки наставника по исходным данным. Ответы в тетради проверяются отдельно и не подтверждают содержимое файла." });
  return requirements;
}

async function inspectFile(file: AttemptFile, variantId: string) {
  const { url, name } = file;
  // Ни URL извне, ни вложенные пути, ни кодированные разделители не принимаем.
  if (!/^\/uploads\/[A-Za-z0-9_-][A-Za-z0-9._-]*\.(xlsx|pptx)$/i.test(url) || url.includes("..")) {
    return { name, url, error: "Нужен загруженный на сайт файл .xlsx или .pptx" };
  }
  try {
    const root = await realpath(process.env.UPLOADS_DIR?.trim() || path.join(process.cwd(), "public", "uploads"));
    const full = await realpath(path.join(/*turbopackIgnore: true*/ root, path.basename(url)));
    // Проверяем и реальный путь: ссылка внутри uploads не должна вести наружу.
    if (path.dirname(full) !== root) return { name, url, error: "Файл за пределами папки загрузок" };
    const handle = await open(/*turbopackIgnore: true*/ full, "r");
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > MAX_BYTES) return { name, url, error: "Файл недоступен или больше 64 МБ" };
      // Читаем ограниченный объём даже при росте файла между stat и read.
      const bytes = Buffer.alloc(info.size + 1);
      let length = 0;
      while (length < bytes.length) {
        const { bytesRead } = await handle.read(bytes, length, bytes.length - length, null);
        if (!bytesRead) break;
        length += bytesRead;
      }
      if (length > info.size) return { name, url, error: "Файл изменился во время чтения" };
      const buffer = bytes.subarray(0, length);
      if (url.toLowerCase().endsWith(".xlsx")) {
        const inspected = await inspectBXlsx(buffer);
        // Значения и формулы ячеек не возвращаем и не переносим в тетрадь.
        const facts = {
          worksheets: inspected.worksheets.map((sheet) => ({ name: sheet.name, cellCount: sheet.cells.length })),
          cells: inspected.cells, pivots: inspected.pivots, chartTypes: inspected.chartTypes,
        };
        return { name, url, facts, requirements: fileRequirements(variantId, facts) };
      }
      const inspected = await inspectBPptx(buffer);
      const facts = {
        slides: inspected.slides.slice(0, 200).map((slide) => ({ path: slide.path, text: slide.text.slice(0, 2000) })),
        count: inspected.count, wide: inspected.wide, aspect16by9: inspected.aspect16by9,
      };
      return { name, url, facts, requirements: fileRequirements(variantId, facts) };
    } finally {
      await handle.close();
    }
  } catch {
    return { name, url, error: "Не удалось прочитать файл Office: файл отсутствует, повреждён или слишком большой" };
  }
}

async function postHandler(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!canUsePoligon(user)) return NextResponse.json({ error: "Раздел «Профессионалы» тебе пока не открыт" }, { status: 403 });
  const { id } = await params;
  const attempt = await prisma.poligonAttempt.findUnique({ where: { id } });
  if (!attempt || (attempt.userId !== user.id && user.role !== "ADMIN")) {
    return NextResponse.json({ error: "Попытка не найдена" }, { status: 404 });
  }
  if (!isBPractice(attempt.variantId)) return NextResponse.json({ error: "Это не учебная практика модуля Б" }, { status: 400 });
  if (attempt.status !== "IN_PROGRESS") return NextResponse.json({ error: "Попытка уже сдана" }, { status: 409 });
  const files = parseFiles(attempt.fileUrls);
  if (!files.length) return NextResponse.json({ error: "Сначала сохрани загруженные файлы в попытке" }, { status: 400 });
  // Ограничиваем дорогую распаковку для всех пользователей, включая тренера.
  const limitKey = `poligon:b-check:${user.id}`;
  const wait = retryAfterSec(limitKey, 5);
  if (wait > 0) return NextResponse.json({ error: "Не больше пяти проверок в минуту" }, {
    status: 429, headers: { "Retry-After": String(wait) },
  });
  hit(limitKey, 60_000);
  // Тело запроса не используем: проверяем исключительно сохранённые ссылки.
  const facts = [];
  for (const file of files.slice(0, 20)) {
    const result = await inspectFile(file, attempt.variantId);
    // Ошибка чтения не считается успешно подтверждённым свойством файла.
    facts.push(result.error ? { ...result, requirements: [{ label: "Файл Office прочитан", ok: false,
      feedback: result.error }] satisfies Requirement[] } : result);
    if (Buffer.byteLength(JSON.stringify(facts), "utf8") > MAX_FACTS_BYTES) {
      return NextResponse.json({ error: "Отчёт о файлах превышает 100 КБ", facts: [], requirements: [{
        label: "Размер отчёта о файлах", ok: false, feedback: "Сократи число или сложность файлов и повтори проверку.",
      }] }, { status: 413 });
    }
  }
  const requirements = facts.flatMap((file) => file.requirements ?? []);
  const ok = requirements.some((item) => item.ok === false) ? false
    : requirements.some((item) => item.ok === null) ? null : true;
  const response = { facts, requirements, ok };
  if (Buffer.byteLength(JSON.stringify(response), "utf8") > MAX_FACTS_BYTES) {
    return NextResponse.json({ error: "Отчёт о файлах превышает 100 КБ", facts: [] }, { status: 413 });
  }
  const workbook = parseWorkbook(attempt.workbook);
  workbook._b_filecheck = JSON.stringify(facts);
  const updated = await prisma.poligonAttempt.updateMany({
    where: { id, status: "IN_PROGRESS", updatedAt: attempt.updatedAt, workbook: attempt.workbook, fileUrls: attempt.fileUrls },
    data: { workbook: JSON.stringify(workbook) },
  });
  if (!updated.count) return NextResponse.json({ error: "Попытка уже изменена. Повтори проверку" }, { status: 409 });
  return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
}

export const POST = handleAuth(postHandler);
