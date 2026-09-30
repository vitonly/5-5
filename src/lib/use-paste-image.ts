"use client";

import { useCallback, useState } from "react";
import { uploadAppFile } from "@/lib/upload-client";

function clipboardImageFile(e: React.ClipboardEvent): File | null {
  const items = e.clipboardData?.items;
  if (!items) return null;
  for (const item of Array.from(items)) {
    if (item.type.startsWith("image/")) {
      const blob = item.getAsFile();
      if (!blob) continue;
      const ext = item.type.split("/")[1] || "png";
      return new File([blob], `paste-${Date.now()}.${ext}`, { type: item.type });
    }
  }
  return null;
}

/**
 * Ctrl+V / Cmd+V: если в буфере картинка — загрузка через uploadAppFile.
 * @param onUploaded вызывается с URL после успешной загрузки
 * @param acceptOnlyImages если false — не перехватывает paste (для текстовых полей с опциональной картинкой всё равно вызывайте на контейнере)
 */
export function usePasteImage(opts: {
  onUploaded: (url: string, file: File) => void | Promise<void>;
  onError?: (message: string) => void;
  enabled?: boolean;
  /** Если true — preventDefault только когда есть image (текст вставляется как обычно) */
  imagesOnly?: boolean;
}) {
  const { onUploaded, onError, enabled = true, imagesOnly = true } = opts;
  const [uploading, setUploading] = useState(false);

  const onPaste = useCallback(
    async (e: React.ClipboardEvent) => {
      if (!enabled || uploading) return;
      const file = clipboardImageFile(e);
      if (!file) return;
      if (imagesOnly) e.preventDefault();
      setUploading(true);
      try {
        const { url } = await uploadAppFile(file);
        await onUploaded(url, file);
      } catch (err) {
        onError?.(err instanceof Error ? err.message : "Не удалось загрузить изображение");
      } finally {
        setUploading(false);
      }
    },
    [enabled, uploading, imagesOnly, onUploaded, onError]
  );

  return { onPaste, uploading };
}
