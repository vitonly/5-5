"use client";

import { upload } from "@vercel/blob/client";

/**
 * Загрузка файла: на проде — напрямую в Vercel Blob (минуя лимит 4.5 МБ функции),
 * локально / без Blob — multipart на /api/upload.
 */
export async function uploadAppFile(file: File): Promise<{ url: string }> {
  // Пробуем client Blob upload (нужен BLOB_READ_WRITE_TOKEN на сервере)
  try {
    const blob = await upload(file.name, file, {
      access: "public",
      handleUploadUrl: "/api/upload",
    });
    return { url: blob.url };
  } catch (e) {
    // Fallback multipart (dev или если handleUpload недоступен)
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        typeof data.error === "string"
          ? data.error
          : e instanceof Error
            ? e.message
            : "Не удалось загрузить файл"
      );
    }
    if (!data.url) throw new Error("Сервер не вернул URL файла");
    return { url: data.url as string };
  }
}
