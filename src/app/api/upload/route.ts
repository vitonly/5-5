import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import { requireUser } from "@/lib/session";
import { handleAuth } from "@/lib/api-auth";
import { hit, retryAfterSec } from "@/lib/rate-limit";

const MAX_BYTES = 64 * 1024 * 1024;

/**
 * Лимит для учеников: не больше 30 файлов в час.
 * Без него можно загружать файлы по 64 МБ без остановки и забить весь диск сервера.
 * У тренера лимита нет.
 */
const STUDENT_FILES_PER_HOUR = 30;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Разрешённые расширения. Файлы из /uploads nginx отдаёт напрямую с домена сайта,
 * поэтому .html/.svg/.js и т.п. запрещены: в них можно спрятать скрипт (XSS).
 */
const ALLOWED_EXT = new Set([
  // картинки
  "png", "jpg", "jpeg", "webp", "gif", "bmp", "heic", "heif", "avif", "tif", "tiff",
  // видео
  "mp4", "mov", "webm",
  // документы
  "pdf", "txt", "doc", "docx", "ppt", "pptx", "odt", "odp",
  // демки Dota
  "dem",
]);

function uploadsDir(): string {
  return (
    process.env.UPLOADS_DIR?.trim() || path.join(process.cwd(), "public", "uploads")
  );
}

/** VPS / self-host: всегда пишем на диск. */
async function saveToDisk(file: File, safeName: string): Promise<string> {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const dir = uploadsDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, safeName), buffer);
  return `/uploads/${safeName}`;
}

async function postHandler(request: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limitKey = `upload:${user.id}`;
  if (user.role !== "ADMIN") {
    const wait = retryAfterSec(limitKey, STUDENT_FILES_PER_HOUR);
    if (wait > 0) {
      return NextResponse.json(
        { error: `Слишком много файлов за час. Попробуйте через ${Math.ceil(wait / 60)} мин.` },
        { status: 429, headers: { "Retry-After": String(wait) } }
      );
    }
  }

  const contentType = request.headers.get("content-type") || "";

  // Старый Blob client flow больше не поддерживаем
  if (contentType.includes("application/json")) {
    return NextResponse.json(
      { error: "Загрузка через Vercel Blob отключена. Обновите страницу (Ctrl+F5)." },
      { status: 410 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Максимальный размер файла — 64 МБ" }, { status: 400 });
    }

    const cleaned = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const ext = cleaned.includes(".") ? cleaned.split(".").pop()!.toLowerCase() : "";
    if (!ALLOWED_EXT.has(ext)) {
      return NextResponse.json(
        { error: "Такой тип файла загружать нельзя. Разрешены картинки, видео, PDF, документы и демки." },
        { status: 400 }
      );
    }
    const base = cleaned.slice(0, -(ext.length + 1)).replace(/\./g, "_").slice(0, 80) || "file";
    // Случайная часть в имени — чтобы адрес чужого файла нельзя было угадать перебором
    const safeName = `${Date.now()}-${randomBytes(6).toString("hex")}-${base}.${ext}`;
    const url = await saveToDisk(file, safeName);
    if (user.role !== "ADMIN") hit(limitKey, HOUR_MS);
    return NextResponse.json({ url });
  } catch (e) {
    console.error("[upload]", e);
    return NextResponse.json(
      { error: "Ошибка записи файла на сервер" },
      { status: 500 }
    );
  }
}

// Нет входа / нет прав — ответ 401 / 403, а не «ошибка сервера»
export const POST = handleAuth(postHandler);
