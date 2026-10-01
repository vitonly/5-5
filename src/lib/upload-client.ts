"use client";

import { upload } from "@vercel/blob/client";

/**
 * Загрузка файла.
 * Сначала multipart на /api/upload (VPS пишет на диск).
 * Если сервер ждёт Blob token flow — fallback на @vercel/blob/client.
 */
export async function uploadAppFile(file: File): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: formData });
  const data = await res.json().catch(() => ({}));

  if (res.ok && typeof data.url === "string" && data.url) {
    return { url: data.url };
  }

  // Старый путь Vercel Blob (если настроен BLOB_READ_WRITE_TOKEN)
  try {
    const blob = await upload(file.name, file, {
      access: "public",
      handleUploadUrl: "/api/upload",
    });
    return { url: blob.url };
  } catch (e) {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : e instanceof Error
          ? e.message
          : "Не удалось загрузить файл"
    );
  }
}
