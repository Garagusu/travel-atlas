import "server-only";
import exifr from "exifr";
import sharp, { type Metadata } from "sharp";

export const PHOTO_VARIANTS = ["thumb", "display", "original"] as const;
export type PhotoVariant = (typeof PHOTO_VARIANTS)[number];

const SUPPORTED = new Set(["jpeg", "png", "webp", "avif", "gif", "tiff", "heif"]);
const MIME: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  tiff: "image/tiff",
  heif: "image/heif",
};

export class ImageError extends Error {}

export type ProcessedImage = {
  mimeType: string;
  ext: string;
  width: number;
  height: number;
  dominantColor: string;
  takenOn: string | null;
  thumb: Buffer;
  display: Buffer;
};

const hex = (n: number) => n.toString(16).padStart(2, "0");

/**
 * Validates an uploaded image and produces web-friendly variants:
 * thumb (≤640px WebP) for grids, display (≤2048px WebP) for the viewer.
 * Variants are auto-rotated and stripped of EXIF/GPS metadata.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  let meta: Metadata;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw new ImageError("This file isn't a readable image. Use JPEG, PNG, WebP, AVIF or GIF.");
  }
  if (!meta.format || !SUPPORTED.has(meta.format)) {
    throw new ImageError(`Unsupported image format (${meta.format ?? "unknown"}). Use JPEG, PNG, WebP, AVIF or GIF.`);
  }
  if ((meta.width ?? 0) * (meta.height ?? 0) > 120_000_000) {
    throw new ImageError("This image is larger than 120 megapixels.");
  }

  try {
    const base = () => sharp(input, { failOn: "error", animated: false }).autoOrient();
    const [thumb, display, stats] = await Promise.all([
      base().resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true }).webp({ quality: 76 }).toBuffer(),
      base().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).webp({ quality: 84 }).toBuffer(),
      sharp(input).stats(),
    ]);
    const oriented = (meta.orientation ?? 1) >= 5;
    const width = (oriented ? meta.height : meta.width) ?? 0;
    const height = (oriented ? meta.width : meta.height) ?? 0;
    const { r, g, b } = stats.dominant;

    let takenOn: string | null = null;
    try {
      const exif = await exifr.parse(input, ["DateTimeOriginal", "CreateDate"]);
      const d: unknown = exif?.DateTimeOriginal ?? exif?.CreateDate;
      if (d instanceof Date && !Number.isNaN(d.getTime())) takenOn = d.toISOString().slice(0, 10);
    } catch {
      /* no EXIF — fine */
    }

    return {
      mimeType: MIME[meta.format],
      ext: meta.format === "jpeg" ? "jpg" : meta.format,
      width,
      height,
      dominantColor: `#${hex(r)}${hex(g)}${hex(b)}`,
      takenOn,
      thumb,
      display,
    };
  } catch (err) {
    if (meta.format === "heif") {
      throw new ImageError(
        "HEIC photos can't be processed. On iPhone choose Settings → Camera → Formats → Most Compatible, or export the photo as JPEG.",
      );
    }
    throw new ImageError(`Couldn't process this image: ${(err as Error).message}`);
  }
}

export const variantKey = (storageKey: string, variant: PhotoVariant, ext: string) =>
  variant === "original" ? `${storageKey}/original.${ext}` : `${storageKey}/${variant}.webp`;

const EXT_BY_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(MIME).map(([fmt, mime]) => [mime, fmt === "jpeg" ? "jpg" : fmt]),
);
export const extForMime = (mime: string) => EXT_BY_MIME[mime] ?? "bin";
