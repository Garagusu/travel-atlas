import { PassThrough, Readable } from "node:stream";
import { ZipArchive } from "archiver";
import { NextResponse } from "next/server";
import { apiUser } from "@/lib/api";
import { buildExport } from "@/lib/export";
import { extForMime, variantKey } from "@/lib/images";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

/** Full backup: data.json plus every original photo, streamed as a ZIP. */
export async function GET() {
  const user = await apiUser();
  if (user instanceof NextResponse) return user;
  const data = await buildExport(user.id);
  const store = storage();

  const zip = new ZipArchive({ zlib: { level: 1 } }); // photos are already compressed
  const out = new PassThrough();
  zip.pipe(out);

  (async () => {
    try {
      zip.append(JSON.stringify(data, null, 2), { name: "data.json" });
      for (const p of data.photos) {
        const ext = extForMime(p.mimeType);
        const obj = await store.get(variantKey(p.storageKey, "original", ext));
        if (!obj) continue;
        const nodeStream = Readable.fromWeb(obj.body as import("node:stream/web").ReadableStream);
        zip.append(nodeStream, { name: `photos/${p.id}/original.${ext}` });
        // wait for this entry before opening the next file handle
        await new Promise<void>((resolve, reject) => {
          zip.once("entry", () => resolve());
          zip.once("error", reject);
        });
      }
      await zip.finalize();
    } catch (err) {
      console.error("backup archive failed", err);
      zip.abort();
      out.destroy(err as Error);
    }
  })();

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(Readable.toWeb(out) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="travel-journal-backup-${stamp}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
