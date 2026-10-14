import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { apiUser, jsonError, sameOrigin } from "@/lib/api";
import { ImportError, importBackup } from "@/lib/import";

export const runtime = "nodejs";
export const maxDuration = 900;

/**
 * Restore a backup ZIP (sent as the raw request body). Replaces the signed-in
 * account's data. Accepts backups from this app and from the GitHub Pages edition.
 */
export async function POST(req: Request) {
  const user = await apiUser();
  if (user instanceof NextResponse) return user;
  if (!sameOrigin(req)) return jsonError(403, "Cross-site request rejected");
  if (!req.body) return jsonError(400, "Choose a backup file");

  const file = path.join(tmpdir(), `travel-atlas-import-${randomUUID()}.zip`);
  try {
    await pipeline(Readable.fromWeb(req.body as import("node:stream/web").ReadableStream), createWriteStream(file));
    const summary = await importBackup(user.id, file);
    revalidatePath("/", "layout");
    return NextResponse.json({ summary });
  } catch (err) {
    if (err instanceof ImportError) return jsonError(422, err.message);
    if ((err as Error).message?.includes("end of central directory")) return jsonError(422, "This file isn't a ZIP backup.");
    console.error("backup import failed", err);
    return jsonError(500, "Restoring the backup failed. Your previous data may be partly replaced; try the restore again.");
  } finally {
    await rm(file, { force: true });
  }
}
