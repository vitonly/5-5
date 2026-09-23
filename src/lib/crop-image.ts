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

export async function cropImageToBlob(
  imageSrc: string,
  crop: CropArea,
  mimeType = "image/jpeg",
  quality = 0.92
): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const x = Math.max(0, Math.round(crop.x));
  const y = Math.max(0, Math.round(crop.y));
  const width = Math.max(1, Math.round(crop.width));
  const height = Math.max(1, Math.round(crop.height));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  // Белый фон: JPEG без альфы, плюс корректный вид для PNG с прозрачностью
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, x, y, width, height, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Не удалось обработать изображение"))),
      mimeType,
      quality
    );
  });
}
