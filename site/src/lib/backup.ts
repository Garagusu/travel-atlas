import { strFromU8, strToU8, unzip, zip, type Unzipped, type Zippable } from "fflate";
import { db, RECORD_STORES } from "./db";
import { reloadFromDb } from "./store";

const FORMAT = "travel-atlas-backup";

/** Everything on this device (records + every photo file) as one ZIP. */
export async function exportBackup(onProgress?: (msg: string) => void): Promise<Blob> {
  const d = await db();
  const data: Record<string, unknown[]> = {};
  for (const s of RECORD_STORES) data[s] = await d.getAll(s);
  const files: Zippable = {};
  files["data.json"] = strToU8(JSON.stringify({ format: FORMAT, version: 1, exportedAt: new Date().toISOString(), ...data }, null, 2));
  const keys = await d.getAllKeys("blobs");
  let n = 0;
  for (const key of keys) {
    const blob = await d.get("blobs", key);
    if (!blob) continue;
    // photos are already compressed — store, don't deflate
    files[`photos/${key}`] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
    if (++n % 20 === 0) onProgress?.(`Packing photos… ${n}/${keys.length}`);
  }
  onProgress?.("Creating ZIP…");
  const bytes = await new Promise<Uint8Array>((res, rej) => zip(files, (err, out) => (err ? rej(err) : res(out))));
  return new Blob([bytes as BlobPart], { type: "application/zip" });
}

/** Replaces everything on this device with the contents of a backup ZIP. */
export async function importBackup(file: File, onProgress?: (msg: string) => void) {
  onProgress?.("Reading backup…");
  const buf = new Uint8Array(await file.arrayBuffer());
  const entries = await new Promise<Unzipped>((res, rej) => unzip(buf, (err, out) => (err ? rej(err) : res(out))));
  if (!entries["data.json"]) throw new Error("This isn't a Travel Atlas backup (data.json is missing).");
  const data = JSON.parse(strFromU8(entries["data.json"]));
  if (data.format !== FORMAT) throw new Error("This isn't a Travel Atlas backup.");
  const d = await db();
  const tx = d.transaction([...RECORD_STORES, "blobs" as const], "readwrite");
  for (const s of RECORD_STORES) {
    await tx.objectStore(s).clear();
    for (const v of (data[s] ?? []) as never[]) await tx.objectStore(s).put(v);
  }
  await tx.objectStore("blobs").clear();
  let n = 0;
  for (const [name, bytes] of Object.entries(entries)) {
    if (!name.startsWith("photos/") || name.endsWith("/")) continue;
    const key = name.slice("photos/".length);
    const type = key.endsWith("/original") ? "" : "image/webp";
    await tx.objectStore("blobs").put(new Blob([bytes as BlobPart], type ? { type } : {}), key);
    if (++n % 50 === 0) onProgress?.(`Restoring photos… ${n}`);
  }
  await tx.done;
  await reloadFromDb();
}

export async function eraseEverything() {
  const d = await db();
  const tx = d.transaction([...RECORD_STORES, "blobs" as const], "readwrite");
  for (const s of [...RECORD_STORES, "blobs"] as const) await tx.objectStore(s).clear();
  await tx.done;
  await reloadFromDb();
}

export async function storageEstimate() {
  try {
    const e = await navigator.storage?.estimate?.();
    const persisted = await navigator.storage?.persisted?.();
    return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0, persisted: !!persisted } : null;
  } catch {
    return null;
  }
}
