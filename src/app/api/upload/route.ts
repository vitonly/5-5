import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { requireUser } from "@/lib/session";

export async function POST(request: NextRequest) {
  await requireUser();
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Максимальный размер файла — 10 МБ" }, { status: 400 });
  }

  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  // Production / any env with Blob token → Vercel Blob (persistent)
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`uploads/${safeName}`, file, {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return NextResponse.json({ url: blob.url });
  }

  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Хранилище файлов не настроено (BLOB_READ_WRITE_TOKEN)" },
      { status: 503 }
    );
  }

  // Local development → public/uploads
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadsDir, { recursive: true });
  const filePath = path.join(uploadsDir, safeName);
  await writeFile(filePath, buffer);

  return NextResponse.json({ url: `/uploads/${safeName}` });
}
