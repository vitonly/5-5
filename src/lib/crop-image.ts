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
    img.addEventListener("error", reject);
    img.crossOrigin = "anonymous";
    img.src = src;
  });
}

export function cropOutputFormat(sourceMime: string): { mimeType: string; extension: string } {
  if (sourceMime === "image/png") return { mimeType: "image/png", extension: "png" };
  if (sourceMime === "image/webp") return { mimeType: "image/webp", extension: "webp" };
  return { mimeType: "image/jpeg", extension: "jpg" };
}

export async function cropImageToBlob(
  imageSrc: string,
  crop: CropArea,
  mimeType = "image/jpeg",
  quality = 0.92
): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = crop.width;
  canvas.height = crop.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  const keepAlpha = mimeType === "image/png" || mimeType === "image/webp";
  if (keepAlpha) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Не удалось обработать изображение"))),
      mimeType,
      quality
    );
  });
}
