import exifr from "exifr";

export class ImageError extends Error {}

export type ProcessedImage = {
  width: number;
  height: number;
  dominantColor: string;
  takenOn: string | null;
  thumb: Blob;
  display: Blob;
};

const MAX_MB = 25;

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // WebP where the browser can encode it (Chrome, Edge, Firefox), JPEG otherwise (Safari).
    canvas.toBlob(
      (b) => {
        if (b && b.type === "image/webp") return resolve(b);
        canvas.toBlob((j) => (j ? resolve(j) : reject(new ImageError("Couldn't encode the image"))), "image/jpeg", quality);
      },
      "image/webp",
      quality,
    );
  });
}

function resized(bitmap: ImageBitmap, max: number) {
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Turns an uploaded photo into a thumbnail (≤640px) and a display copy (≤2048px),
 * honouring EXIF orientation. Re-encoding also drops EXIF/GPS metadata from both copies.
 */
export async function processImage(file: File): Promise<ProcessedImage> {
  if (file.size > MAX_MB * 1024 * 1024) throw new ImageError(`Photos can be up to ${MAX_MB} MB`);
  if (file.type && !file.type.startsWith("image/")) throw new ImageError("Not an image file");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const heic = /heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
    throw new ImageError(
      heic
        ? "This browser can't open HEIC photos. Use Safari, or set iPhone Camera → Formats → Most Compatible."
        : "This file isn't a readable image. Use JPEG, PNG, WebP or GIF.",
    );
  }
  try {
    const [thumb, display] = await Promise.all([canvasToBlob(resized(bitmap, 640), 0.78), canvasToBlob(resized(bitmap, 2048), 0.85)]);
    const one = resized(bitmap, 1);
    const [r, g, b] = one.getContext("2d")!.getImageData(0, 0, 1, 1).data;
    const hex = (n: number) => n.toString(16).padStart(2, "0");
    let takenOn: string | null = null;
    try {
      const exif = await exifr.parse(file, ["DateTimeOriginal", "CreateDate"]);
      const d: unknown = exif?.DateTimeOriginal ?? exif?.CreateDate;
      if (d instanceof Date && !Number.isNaN(d.getTime())) takenOn = d.toISOString().slice(0, 10);
    } catch {
      /* no EXIF */
    }
    return { width: bitmap.width, height: bitmap.height, dominantColor: `#${hex(r)}${hex(g)}${hex(b)}`, takenOn, thumb, display };
  } finally {
    bitmap.close();
  }
}
