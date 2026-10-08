import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { requireUser } from "@/lib/session";

const MAX_BYTES = 64 * 1024 * 1024;

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

export async function POST(request: NextRequest) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const url = await saveToDisk(file, safeName);
    return NextResponse.json({ url });
  } catch (e) {
    console.error("[upload]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ошибка записи файла на сервер" },
      { status: 500 }
    );
  }
}
