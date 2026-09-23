import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { put } from "@vercel/blob";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { requireUser } from "@/lib/session";

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Два режима:
 * 1) JSON — client upload через @vercel/blob/client (прод, файлы до 10 МБ мимо лимита функции)
 * 2) multipart — локальная запись / put с сервера (dev или простой fallback)
 */
export async function POST(request: NextRequest) {
  await requireUser();

  const contentType = request.headers.get("content-type") || "";

  // Client → Blob (token flow)
  if (contentType.includes("application/json")) {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        {
          error:
            "Хранилище не настроено. В Vercel создайте Blob Store и добавьте BLOB_READ_WRITE_TOKEN.",
        },
        { status: 503 }
      );
    }

    const body = (await request.json()) as HandleUploadBody;

    try {
      const jsonResponse = await handleUpload({
        body,
        request,
        onBeforeGenerateToken: async () => ({
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
        }),
        onUploadCompleted: async () => {
          /* no-op */
        },
      });
      return NextResponse.json(jsonResponse);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Ошибка загрузки" },
        { status: 400 }
      );
    }
  }

  // multipart FormData
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Максимальный размер файла — 10 МБ" }, { status: 400 });
  }

  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    // На Hobby тело запроса к функции ≤ ~4.5 МБ — для больших файлов клиент должен идти через JSON/handleUpload
    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json(
        {
          error:
            "Файл больше 4 МБ: обновите страницу и попробуйте снова (нужна прямая загрузка в Blob).",
        },
        { status: 413 }
      );
    }
    const blob = await put(`uploads/${safeName}`, file, {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return NextResponse.json({ url: blob.url });
  }

  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        error:
          "Хранилище файлов не настроено. Vercel → Storage → Blob → создайте store → BLOB_READ_WRITE_TOKEN в Environment Variables → Redeploy.",
      },
      { status: 503 }
    );
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(path.join(uploadsDir, safeName), buffer);

  return NextResponse.json({ url: `/uploads/${safeName}` });
}
