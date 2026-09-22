"use client";

import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Button } from "@/components/ui/button";
import { cropImageToBlob, cropOutputFormat } from "@/lib/crop-image";

import { CARD_WIDTH } from "@/lib/card-design";

/** Соотношение сторон фото на карточке */
export const CARD_PHOTO_ASPECT = CARD_WIDTH / 290;

type ImageCropDialogProps = {
  imageSrc: string;
  open: boolean;
  aspect?: number;
  sourceMimeType?: string;
  onClose: () => void;
  onConfirm: (file: File) => void;
};

export function ImageCropDialog({
  imageSrc,
  open,
  aspect = CARD_PHOTO_ASPECT,
  sourceMimeType = "image/jpeg",
  onClose,
  onConfirm,
}: ImageCropDialogProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedArea(pixels);
  }, []);

  async function handleConfirm() {
    if (!croppedArea) return;
    setProcessing(true);
    try {
      const { mimeType, extension } = cropOutputFormat(sourceMimeType);
      const blob = await cropImageToBlob(imageSrc, croppedArea, mimeType);
      const file = new File([blob], `avatar.${extension}`, { type: mimeType });
      onConfirm(file);
      onClose();
    } finally {
      setProcessing(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/75"
        aria-label="Закрыть"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
        <div className="border-b border-[var(--border-soft)] px-4 py-3">
          <h3 className="font-semibold text-[var(--text)]">Обрезка фото</h3>
          <p className="text-xs text-[var(--text-3)]">Перетащите и масштабируйте, чтобы выбрать область</p>
        </div>

        <div className="relative h-72 bg-black sm:h-80">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <div className="space-y-3 border-t border-[var(--border-soft)] px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="shrink-0 text-xs text-[var(--text-3)]">Масштаб</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-[var(--points)]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={processing}>
              Отмена
            </Button>
            <Button type="button" onClick={handleConfirm} disabled={processing || !croppedArea}>
              {processing ? "Обработка..." : "Применить"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
