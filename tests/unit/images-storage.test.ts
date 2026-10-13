import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { ImageError, processImage, variantKey } from "@/lib/images";
import { createStorageFromEnv, LocalStorage, StorageConfigError, type StorageDriver } from "@/lib/storage";

const dir = mkdtempSync(path.join(tmpdir(), "tj-storage-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function streamToBuffer(s: ReadableStream<Uint8Array>) {
  return Buffer.from(await new Response(s).arrayBuffer());
}

describe("image processing", () => {
  it("creates WebP thumb and display variants with dimensions and colour", async () => {
    const img = await processImage(readFileSync("tests/fixtures/landscape.jpg"));
    expect(img.mimeType).toBe("image/jpeg");
    expect(img.width).toBe(1600);
    expect(img.height).toBe(1067);
    expect(img.dominantColor).toMatch(/^#[0-9a-f]{6}$/);
    const thumb = await sharp(img.thumb).metadata();
    expect(thumb.format).toBe("webp");
    expect(Math.max(thumb.width!, thumb.height!)).toBeLessThanOrEqual(640);
    const display = await sharp(img.display).metadata();
    expect(display.width).toBe(1600); // never upscaled
  });

  it("reads the capture date from EXIF", async () => {
    const buf = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#336699" } })
      .jpeg()
      .withExif({ IFD0: { Make: "Test" }, IFD2: { DateTimeOriginal: "2023:07:04 18:30:00" } } as never)
      .toBuffer();
    expect((await processImage(buf)).takenOn).toBe("2023-07-04");
  });

  it("applies EXIF orientation to reported dimensions", async () => {
    const buf = await sharp({ create: { width: 80, height: 40, channels: 3, background: "#aa3300" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const img = await processImage(buf);
    expect([img.width, img.height]).toEqual([40, 80]);
  });

  it("rejects files that aren't images", async () => {
    await expect(processImage(readFileSync("tests/fixtures/not-image.jpg"))).rejects.toBeInstanceOf(ImageError);
  });
});

describe("local storage driver", () => {
  const store: StorageDriver = new LocalStorage(dir);

  it("writes, reads and deletes all variants under a prefix", async () => {
    await store.put(variantKey("u1/p1", "thumb", "jpg"), Buffer.from("thumb"), "image/webp");
    await store.put(variantKey("u1/p1", "original", "jpg"), Buffer.from("orig"), "image/jpeg");
    const got = await store.get("u1/p1/thumb.webp");
    expect(got && (await streamToBuffer(got.body)).toString()).toBe("thumb");
    await store.deletePrefix("u1/p1");
    expect(await store.get("u1/p1/original.jpg")).toBeNull();
  });

  it("refuses path traversal", async () => {
    await expect(store.put("../escape.txt", Buffer.from("x"), "text/plain")).rejects.toThrow(/Invalid storage key/);
  });

  it("explains missing S3 settings", () => {
    expect(() => createStorageFromEnv({ STORAGE_DRIVER: "s3", S3_BUCKET: "b" } as unknown as NodeJS.ProcessEnv)).toThrow(StorageConfigError);
    expect(() => createStorageFromEnv({ STORAGE_DRIVER: "ftp" } as unknown as NodeJS.ProcessEnv)).toThrow(/Unknown STORAGE_DRIVER/);
    expect(createStorageFromEnv({ STORAGE_DRIVER: "s3", S3_BUCKET: "b", S3_ACCESS_KEY_ID: "k", S3_SECRET_ACCESS_KEY: "s" } as unknown as NodeJS.ProcessEnv).name).toBe("s3");
  });
});
