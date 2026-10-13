import { randomUUID } from "node:crypto";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { albumPhotos, albums, cities, journalEntries, journalPhotos, photos, trips } from "@/db/schema";
import { apiUser, jsonError, sameOrigin } from "@/lib/api";
import { listPhotosPage } from "@/lib/data";
import { ImageError, processImage, variantKey } from "@/lib/images";
import { storage, StorageConfigError } from "@/lib/storage";

export const runtime = "nodejs";

const MAX_MB = Number(process.env.MAX_UPLOAD_MB ?? 25);
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Paginated photo library: GET /api/photos?before=<iso>&limit=60 */
export async function GET(req: Request) {
  const user = await apiUser();
  if (user instanceof NextResponse) return user;
  const url = new URL(req.url);
  const before = url.searchParams.get("before") ?? undefined;
  if (before && Number.isNaN(Date.parse(before))) return jsonError(400, "Invalid cursor");
  const limit = Number(url.searchParams.get("limit") ?? 60) || 60;
  const page = await listPhotosPage(user.id, { before, limit });
  return NextResponse.json(page);
}

/**
 * Upload one photo (multipart/form-data):
 *   file (required), cityId, tripId, albumId, journalEntryId, caption
 */
export async function POST(req: Request) {
  const user = await apiUser();
  if (user instanceof NextResponse) return user;
  if (!sameOrigin(req)) return jsonError(403, "Cross-site upload rejected");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError(400, "Send the photo as multipart/form-data");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError(400, "Choose a photo to upload");
  if (file.size === 0) return jsonError(400, "This file is empty");
  if (file.size > MAX_MB * 1024 * 1024) return jsonError(413, `Photos can be up to ${MAX_MB} MB; this one is ${(file.size / 1048576).toFixed(1)} MB`);

  const str = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const cityId = str("cityId") ? Number(str("cityId")) : null;
  const tripId = str("tripId");
  const albumId = str("albumId");
  const entryId = str("journalEntryId");
  const caption = str("caption")?.slice(0, 200) ?? null;

  if (cityId !== null && (!Number.isInteger(cityId) || cityId <= 0)) return jsonError(400, "Invalid city");
  for (const v of [tripId, albumId, entryId]) if (v && !uuidRe.test(v)) return jsonError(400, "Invalid reference");

  // Every reference must belong to this user.
  if (cityId) {
    const [c] = await db.select({ id: cities.id }).from(cities)
      .where(and(eq(cities.id, cityId), or(isNull(cities.createdBy), eq(cities.createdBy, user.id)))).limit(1);
    if (!c) return jsonError(404, "City not found");
  }
  if (tripId) {
    const [t] = await db.select({ id: trips.id }).from(trips).where(and(eq(trips.id, tripId), eq(trips.userId, user.id))).limit(1);
    if (!t) return jsonError(404, "Trip not found");
  }
  if (albumId) {
    const [a] = await db.select({ id: albums.id }).from(albums).where(and(eq(albums.id, albumId), eq(albums.userId, user.id))).limit(1);
    if (!a) return jsonError(404, "Album not found");
  }
  if (entryId) {
    const [e] = await db.select({ id: journalEntries.id }).from(journalEntries)
      .where(and(eq(journalEntries.id, entryId), eq(journalEntries.userId, user.id))).limit(1);
    if (!e) return jsonError(404, "Journal entry not found");
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let processed;
  try {
    processed = await processImage(buf);
  } catch (err) {
    if (err instanceof ImageError) return jsonError(422, err.message);
    console.error("image processing failed", err);
    return jsonError(500, "Couldn't process this photo");
  }

  const photoId = randomUUID();
  const storageKey = `${user.id}/${photoId}`;
  let store;
  try {
    store = storage();
  } catch (err) {
    if (err instanceof StorageConfigError) return jsonError(500, `Photo storage isn't configured: ${err.message}`);
    throw err;
  }
  try {
    await Promise.all([
      store.put(variantKey(storageKey, "original", processed.ext), buf, processed.mimeType),
      store.put(variantKey(storageKey, "display", processed.ext), processed.display, "image/webp"),
      store.put(variantKey(storageKey, "thumb", processed.ext), processed.thumb, "image/webp"),
    ]);
  } catch (err) {
    console.error("storage write failed", err);
    await store.deletePrefix(storageKey).catch(() => {});
    return jsonError(502, "Couldn't save the photo to storage. Check the storage settings and try again.");
  }

  try {
    const row = await db.transaction(async (tx) => {
      const [{ next }] = cityId
        ? await tx
            .select({ next: sql<number>`coalesce(max(${photos.position}) + 1, 0)::int` })
            .from(photos)
            .where(and(eq(photos.userId, user.id), eq(photos.cityId, cityId)))
        : [{ next: 0 }];
      const [inserted] = await tx
        .insert(photos)
        .values({
          id: photoId,
          userId: user.id,
          cityId,
          tripId,
          storageKey,
          originalName: file.name?.slice(0, 255) || null,
          mimeType: processed.mimeType,
          sizeBytes: file.size,
          width: processed.width,
          height: processed.height,
          dominantColor: processed.dominantColor,
          takenOn: processed.takenOn,
          caption,
          position: next,
        })
        .returning();
      if (albumId) {
        const [{ pos }] = await tx
          .select({ pos: sql<number>`coalesce(max(${albumPhotos.position}) + 1, 0)::int` })
          .from(albumPhotos)
          .where(eq(albumPhotos.albumId, albumId));
        await tx.insert(albumPhotos).values({ albumId, photoId, position: pos });
        await tx.update(albums).set({ updatedAt: sql`now()` }).where(eq(albums.id, albumId));
      }
      if (entryId) {
        const [{ pos }] = await tx
          .select({ pos: sql<number>`coalesce(max(${journalPhotos.position}) + 1, 0)::int` })
          .from(journalPhotos)
          .where(eq(journalPhotos.entryId, entryId));
        await tx.insert(journalPhotos).values({ entryId, photoId, position: pos });
      }
      return inserted;
    });
    revalidatePath("/", "layout");
    return NextResponse.json(
      {
        photo: {
          id: row.id,
          width: row.width,
          height: row.height,
          dominantColor: row.dominantColor,
          caption: row.caption,
          description: row.description,
          takenOn: row.takenOn,
          cityId: row.cityId,
          tripId: row.tripId,
          createdAt: row.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("photo insert failed", err);
    await store.deletePrefix(storageKey).catch(() => {});
    return jsonError(500, "Couldn't save the photo record");
  }
}
