"use client";

/**
 * Загрузка файла на сервер (VPS → диск /uploads).
 * Без Vercel Blob — сайт на своём хостинге.
 */
export async function uploadAppFile(file: File): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: formData });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };

  if (res.ok && typeof data.url === "string" && data.url) {
    return { url: data.url };
  }

  throw new Error(
    typeof data.error === "string" && data.error
      ? data.error
      : `Не удалось загрузить файл (${res.status})`
  );
}
