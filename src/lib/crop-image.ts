export type CropArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", () => reject(new Error("Не удалось открыть изображение")));
    // crossOrigin на blob:/data: ломает загрузку (в т.ч. PNG) в части браузеров
    if (!src.startsWith("blob:") && !src.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    img.src = src;
  });
}

/** Аватар после кропа всегда JPEG — стабильно для любого исходного формата */
export function cropOutputFormat(_sourceMime?: string): { mimeType: string; extension: string } {
  return { mimeType: "image/jpeg", extension: "jpg" };
}

/**
 * Фото профиля показывается максимум ~300 пикселей (FIFA-карточка), на чётких экранах — вдвое больше.
 * Поэтому длинную сторону уменьшаем до 640: раньше фото с телефона сохранялось как есть
 * (до 3000+ пикселей и 2–3 МБ), и страницы с аватарками долго грузились на мобильном интернете.
 */
export const AVATAR_MAX_SIDE = 640;

export async function cropImageToBlob(
  imageSrc: string,
  crop: CropArea,
  mimeType = "image/jpeg",
  quality = 0.88,
  maxSide = AVATAR_MAX_SIDE
): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const x = Math.max(0, Math.round(crop.x));
  const y = Math.max(0, Math.round(crop.y));
  const width = Math.max(1, Math.round(crop.width));
  const height = Math.max(1, Math.round(crop.height));

  // Во сколько раз уменьшить (1 — оставить как есть, если фото и так небольшое)
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const outW = Math.max(1, Math.round(width * scale));
  const outH = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  // Белый фон: JPEG без альфы, плюс корректный вид для PNG с прозрачностью
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outW, outH);
  ctx.imageSmoothingQuality = "high";   // аккуратное уменьшение без «лесенки»
  ctx.drawImage(image, x, y, width, height, 0, 0, outW, outH);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Не удалось обработать изображение"))),
      mimeType,
      quality
    );
  });
}
