/*
 * Модуль А за 4 часа: автопроверка загруженных файлов.
 * POST — сервер открывает файлы попытки (.docx, .pptx), достаёт текст и проверяет измеряемые аспекты.
 * Файлы и вводную берём из сохранённой тетради попытки, а не из запроса — так их не подменить.
 */
import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { handleAuth } from "@/lib/api-auth";
import { parseWorkbook } from "@/lib/poligon/a-practicum";
import { A_STAGES, checkAFour, parseBrief, type AStageId, type Extract, type StageFile } from "@/lib/poligon/a-four";
import { parseDocx, parsePptx } from "@/lib/poligon/office";

/** Папка загрузок — так же, как в /api/upload */
function uploadsDir(): string {
  return process.env.UPLOADS_DIR?.trim() || path.join(process.cwd(), "public", "uploads");
}

/** Открыть один файл попытки и достать из него текст */
async function extract(url: string, name: string): Promise<Extract> {
  if (/^https?:\/\//i.test(url)) return { kind: "link", url };
  if (!url.startsWith("/uploads/") || url.includes("..")) return { kind: "error", message: "файл не с нашего сайта" };
  const ext = (name.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();
  if (["png", "jpg", "jpeg"].includes(ext)) return { kind: "image" };
  if (ext === "pdf") return { kind: "pdf" };
  const full = path.join(/*turbopackIgnore: true*/ uploadsDir(), path.basename(url));
  try {
    // turbopackIgnore: путь к загрузкам известен только на сервере, трассировать весь проект не нужно
    const st = await stat(/*turbopackIgnore: true*/ full);
    if (st.size > 64 * 1024 * 1024) return { kind: "error", message: "файл больше 64 МБ" };
    const buf = await readFile(/*turbopackIgnore: true*/ full);
    if (ext === "docx") return parseDocx(buf);
    if (ext === "pptx") return parsePptx(buf);
    return { kind: "error", message: `формат .${ext || "?"} не подходит` };
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : "не удалось прочитать файл" };
  }
}

async function postHandler(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const attempt = await prisma.poligonAttempt.findUnique({ where: { id } });
  // Проверять может сам ученик или тренер
  if (!attempt || (attempt.userId !== user.id && user.role !== "ADMIN")) {
    return NextResponse.json({ error: "Попытка не найдена" }, { status: 404 });
  }
  const w = parseWorkbook(attempt.workbook);
  const brief = parseBrief(w.brief);
  if (!brief) return NextResponse.json({ error: "Нет вводной — начни задание заново" }, { status: 400 });

  // Файл каждого этапа хранится в тетради: f_<этап> — ссылка, n_<этап> — имя файла
  const files: Partial<Record<AStageId, StageFile>> = {};
  for (const s of A_STAGES) {
    const url = String(w[`f_${s.id}`] ?? "");
    const name = String(w[`n_${s.id}`] ?? "");
    files[s.id] = url ? { name: name || url, extract: await extract(url, name || url) } : { name: "", extract: { kind: "none" } };
  }
  return NextResponse.json({ report: checkAFour(brief, files) });
}

export const POST = handleAuth(postHandler);
