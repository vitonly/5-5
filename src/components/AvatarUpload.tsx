"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ImageCropDialog } from "@/components/ImageCropDialog";

const ACCEPT_IMAGES =
  "image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp,.heic,.heif,.avif,.tif,.tiff";

type AvatarUploadProps = {
  photoUrl: string;
  onPhotoChange: (url: string) => void;
  onClear?: () => void;
  showDelete?: boolean;
  previewClassName?: string;
};

export function AvatarUpload({
  photoUrl,
  onPhotoChange,
  onClear,
  showDelete = true,
  previewClassName = "h-16 w-16 rounded-full border border-[var(--border)] object-cover",
}: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropSourceMime, setCropSourceMime] = useState("image/jpeg");
  const [error, setError] = useState<string | null>(null);

  function openFilePicker() {
    inputRef.current?.click();
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);

    const mime = file.type || guessMimeFromName(file.name);
    if (mime && !mime.startsWith("image/") && mime !== "application/octet-stream") {
      setError("Выберите файл изображения (PNG, JPG, WEBP и др.)");
      return;
    }

    setCropSourceMime(mime || "image/jpeg");
    const url = URL.createObjectURL(file);
    setCropSrc(url);
  }

  function closeCrop() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }

  async function uploadCroppedFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const { uploadAppFile } = await import("@/lib/upload-client");
      const data = await uploadAppFile(file);
      onPhotoChange(data.url);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Не удалось загрузить файл");
      throw e;
    } finally {
      setUploading(false);
    }
  }

  function clearPhoto() {
    onClear?.();
    onPhotoChange("");
    setError(null);
  }

  return (
    <>
      <div className="mt-2 flex items-center gap-4">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="Аватар" className={previewClassName} />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--control)] text-xl">
            ⚔️
          </div>
        )}
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_IMAGES}
            className="hidden"
            onChange={handleFileSelect}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-fit"
            onClick={openFilePicker}
            disabled={uploading}
          >
            {uploading ? "Загрузка..." : photoUrl ? "Сменить фото" : "Загрузить фото"}
          </Button>
          <p className="text-xs text-[var(--text-3)]">PNG, JPG, WEBP, GIF и другие изображения</p>
          {showDelete && photoUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto w-fit p-0 text-xs text-[var(--danger)] hover:bg-transparent hover:text-[var(--danger)]"
              onClick={clearPhoto}
            >
              Удалить аватар
            </Button>
          )}
          {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
        </div>
      </div>

      {cropSrc && (
        <ImageCropDialog
          key={cropSrc}
          imageSrc={cropSrc}
          sourceMimeType={cropSourceMime}
          open={!!cropSrc}
          onClose={closeCrop}
          onConfirm={uploadCroppedFile}
        />
      )}
    </>
  );
}

function guessMimeFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "bmp":
      return "image/bmp";
    case "heic":
      return "image/heic";
    case "heif":
      return "image/heif";
    case "avif":
      return "image/avif";
    case "tif":
    case "tiff":
      return "image/tiff";
    default:
      return "";
  }
}
