"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ImageCropDialog } from "@/components/ImageCropDialog";

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

  function openFilePicker() {
    inputRef.current?.click();
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCropSourceMime(file.type || "image/jpeg");
    const url = URL.createObjectURL(file);
    setCropSrc(url);
  }

  function closeCrop() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }

  async function uploadCroppedFile(file: File) {
    setUploading(true);
    try {
      const { uploadAppFile } = await import("@/lib/upload-client");
      const data = await uploadAppFile(file);
      onPhotoChange(data.url);
    } catch (e) {
      console.error(e);
    } finally {
      setUploading(false);
      closeCrop();
    }
  }

  function clearPhoto() {
    onClear?.();
    onPhotoChange("");
  }

  return (
    <>
      <div className="mt-2 flex items-center gap-4">
        {photoUrl ? (
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
            accept="image/*"
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
