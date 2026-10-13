"use server";

import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { albumPhotos, albums, cities, cityLogs, photos, stateLogs, trips } from "@/db/schema";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { storage } from "@/lib/storage";
import { albumSchema, photoMetaSchema } from "@/lib/validation";
import { invalid, refreshAll, uuidSchema } from "./helpers";

const idList = z.array(z.string().uuid()).min(1, "Choose at least one photo").max(2000);

export async function updatePhoto(photoId: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (!uuidSchema.safeParse(photoId).success) return fail("Invalid photo");
  const parsed = photoMetaSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const res = await db
    .update(photos)
    .set(parsed.data)
    .where(and(eq(photos.id, photoId), eq(photos.userId, user.id)))
    .returning({ id: photos.id });
  if (!res.length) return fail("Photo not found");
  refreshAll();
  return ok();
}

/** Move photos to a different city and/or trip. Pass null to unlink. */
export async function assignPhotos(
  photoIds: string[],
  target: { cityId?: number | null; tripId?: string | null },
): Promise<ActionResult> {
  const user = await requireUser();
  const ids = idList.safeParse(photoIds);
  if (!ids.success) return invalid(ids.error);
  const set: { cityId?: number | null; tripId?: string | null } = {};
  if (target.cityId !== undefined) {
    if (target.cityId !== null) {
      const [c] = await db
        .select({ id: cities.id })
        .from(cities)
        .where(and(eq(cities.id, target.cityId), or(isNull(cities.createdBy), eq(cities.createdBy, user.id))))
        .limit(1);
      if (!c) return fail("City not found");
    }
    set.cityId = target.cityId;
  }
  if (target.tripId !== undefined) {
    if (target.tripId !== null) {
      const [t] = await db
        .select({ id: trips.id })
        .from(trips)
        .where(and(eq(trips.id, target.tripId), eq(trips.userId, user.id)))
        .limit(1);
      if (!t) return fail("Trip not found");
    }
    set.tripId = target.tripId;
  }
  if (!Object.keys(set).length) return ok();
  await db.update(photos).set(set).where(and(eq(photos.userId, user.id), inArray(photos.id, ids.data)));
  if (set.cityId !== undefined) await tidyCovers(user.id);
  refreshAll();
  return ok();
}

export async function deletePhotos(photoIds: string[]): Promise<ActionResult<{ deleted: number }>> {
  const user = await requireUser();
  const ids = idList.safeParse(photoIds);
  if (!ids.success) return invalid(ids.error);
  const rows = await db
    .select({ id: photos.id, storageKey: photos.storageKey })
    .from(photos)
    .where(and(eq(photos.userId, user.id), inArray(photos.id, ids.data)));
  if (!rows.length) return fail("Photo not found");
  // Covers pointing at these photos are cleared by ON DELETE SET NULL.
  await db.delete(photos).where(and(eq(photos.userId, user.id), inArray(photos.id, rows.map((r) => r.id))));
  const store = storage();
  const failures: string[] = [];
  await Promise.all(
    rows.map((r) =>
      store.deletePrefix(r.storageKey).catch((err) => {
        failures.push(r.id);
        console.error(`Failed to delete stored files for photo ${r.id}:`, err);
      }),
    ),
  );
  refreshAll();
  return ok({ deleted: rows.length });
}

/** Persists a new order for a city gallery. */
export async function reorderCityPhotos(cityId: number, photoIds: string[]): Promise<ActionResult> {
  const user = await requireUser();
  const ids = idList.safeParse(photoIds);
  if (!ids.success) return invalid(ids.error);
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.data.entries()) {
      await tx
        .update(photos)
        .set({ position: i })
        .where(and(eq(photos.id, id), eq(photos.userId, user.id), eq(photos.cityId, cityId)));
    }
  });
  refreshAll();
  return ok();
}

/* ------------------------------ albums ------------------------------ */

async function ownAlbum(userId: string, albumId: string) {
  if (!uuidSchema.safeParse(albumId).success) return false;
  const [a] = await db
    .select({ id: albums.id })
    .from(albums)
    .where(and(eq(albums.id, albumId), eq(albums.userId, userId)))
    .limit(1);
  return !!a;
}

async function tripOwned(userId: string, tripId: string | null) {
  if (!tripId) return true;
  const [t] = await db.select({ id: trips.id }).from(trips).where(and(eq(trips.id, tripId), eq(trips.userId, userId))).limit(1);
  return !!t;
}

export async function createAlbum(input: unknown, photoIds: string[] = []): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = albumSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (!(await tripOwned(user.id, parsed.data.tripId))) return fail("Trip not found");
  const [row] = await db.insert(albums).values({ ...parsed.data, userId: user.id }).returning({ id: albums.id });
  if (photoIds.length) {
    const added = await addToAlbumInternal(user.id, row.id, photoIds);
    if (!added.ok) return added;
  }
  refreshAll();
  return ok({ id: row.id });
}

export async function updateAlbum(albumId: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await ownAlbum(user.id, albumId))) return fail("Album not found");
  const parsed = albumSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (!(await tripOwned(user.id, parsed.data.tripId))) return fail("Trip not found");
  await db.update(albums).set({ ...parsed.data, updatedAt: sql`now()` }).where(eq(albums.id, albumId));
  refreshAll();
  return ok();
}

/** Deletes the album only; its photos stay in your library. */
export async function deleteAlbum(albumId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await ownAlbum(user.id, albumId))) return fail("Album not found");
  await db.delete(albums).where(eq(albums.id, albumId));
  refreshAll();
  redirect("/albums");
}

async function addToAlbumInternal(userId: string, albumId: string, photoIds: string[]): Promise<ActionResult> {
  const ids = idList.safeParse(photoIds);
  if (!ids.success) return invalid(ids.error);
  const owned = await db
    .select({ id: photos.id })
    .from(photos)
    .where(and(eq(photos.userId, userId), inArray(photos.id, ids.data)));
  if (!owned.length) return fail("Photo not found");
  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${albumPhotos.position}) + 1, 0)::int` })
    .from(albumPhotos)
    .where(eq(albumPhotos.albumId, albumId));
  await db
    .insert(albumPhotos)
    .values(owned.map((p, i) => ({ albumId, photoId: p.id, position: next + i })))
    .onConflictDoNothing();
  await db.update(albums).set({ updatedAt: sql`now()` }).where(eq(albums.id, albumId));
  return ok();
}

export async function addPhotosToAlbum(albumId: string, photoIds: string[]): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await ownAlbum(user.id, albumId))) return fail("Album not found");
  const res = await addToAlbumInternal(user.id, albumId, photoIds);
  if (res.ok) refreshAll();
  return res;
}

export async function removePhotosFromAlbum(albumId: string, photoIds: string[]): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await ownAlbum(user.id, albumId))) return fail("Album not found");
  const ids = idList.safeParse(photoIds);
  if (!ids.success) return invalid(ids.error);
  await db.delete(albumPhotos).where(and(eq(albumPhotos.albumId, albumId), inArray(albumPhotos.photoId, ids.data)));
  await db
    .update(albums)
    .set({ coverPhotoId: null })
    .where(and(eq(albums.id, albumId), inArray(albums.coverPhotoId, ids.data)));
  refreshAll();
  return ok();
}

export async function reorderAlbum(albumId: string, photoIds: string[]): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await ownAlbum(user.id, albumId))) return fail("Album not found");
  const ids = idList.safeParse(photoIds);
  if (!ids.success) return invalid(ids.error);
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.data.entries()) {
      await tx
        .update(albumPhotos)
        .set({ position: i })
        .where(and(eq(albumPhotos.albumId, albumId), eq(albumPhotos.photoId, id)));
    }
  });
  refreshAll();
  return ok();
}

export async function setAlbumCover(albumId: string, photoId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await ownAlbum(user.id, albumId))) return fail("Album not found");
  const [inAlbum] = await db
    .select({ id: albumPhotos.photoId })
    .from(albumPhotos)
    .where(and(eq(albumPhotos.albumId, albumId), eq(albumPhotos.photoId, photoId)))
    .limit(1);
  if (!inAlbum) return fail("That photo isn't in this album");
  await db.update(albums).set({ coverPhotoId: photoId, updatedAt: sql`now()` }).where(eq(albums.id, albumId));
  refreshAll();
  return ok();
}

/** Clears city/state covers that point at photos which were moved elsewhere. */
async function tidyCovers(userId: string) {
  const user = { id: userId };
  await db.execute(sql`
    update ${cityLogs} set cover_photo_id = null
    where user_id = ${user.id} and cover_photo_id is not null
      and not exists (select 1 from photos p where p.id = cover_photo_id and p.city_id = "city_logs"."city_id")`);
  await db.execute(sql`
    update ${stateLogs} set cover_photo_id = null
    where user_id = ${user.id} and cover_photo_id is not null
      and not exists (select 1 from photos p join cities c on c.id = p.city_id
                      where p.id = cover_photo_id and c.state_code = "state_logs"."state_code")`);
}
