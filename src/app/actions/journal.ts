"use server";

import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { cities, journalEntries, journalPhotos, photos, trips } from "@/db/schema";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { journalSchema } from "@/lib/validation";
import { invalid, refreshAll, uuidSchema } from "./helpers";

async function checkRefs(userId: string, cityId: number | null, tripId: string | null) {
  if (cityId) {
    const [c] = await db
      .select({ id: cities.id })
      .from(cities)
      .where(and(eq(cities.id, cityId), or(isNull(cities.createdBy), eq(cities.createdBy, userId))))
      .limit(1);
    if (!c) return "City not found";
  }
  if (tripId) {
    const [t] = await db.select({ id: trips.id }).from(trips).where(and(eq(trips.id, tripId), eq(trips.userId, userId))).limit(1);
    if (!t) return "Trip not found";
  }
  return null;
}

async function ownEntry(userId: string, id: string) {
  if (!uuidSchema.safeParse(id).success) return false;
  const [e] = await db
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, userId)))
    .limit(1);
  return !!e;
}

async function setEntryPhotos(userId: string, entryId: string, photoIds: string[]) {
  const ids = z.array(z.string().uuid()).max(500).parse(photoIds);
  await db.delete(journalPhotos).where(eq(journalPhotos.entryId, entryId));
  if (!ids.length) return;
  const owned = new Set(
    (
      await db
        .select({ id: photos.id })
        .from(photos)
        .where(and(eq(photos.userId, userId), inArray(photos.id, ids)))
    ).map((p) => p.id),
  );
  const rows = ids.filter((id) => owned.has(id)).map((photoId, position) => ({ entryId, photoId, position }));
  if (rows.length) await db.insert(journalPhotos).values(rows).onConflictDoNothing();
}

export async function createJournalEntry(input: unknown, photoIds: string[] = []): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = journalSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const refErr = await checkRefs(user.id, parsed.data.cityId, parsed.data.tripId);
  if (refErr) return fail(refErr);
  const [row] = await db
    .insert(journalEntries)
    .values({ ...parsed.data, userId: user.id })
    .returning({ id: journalEntries.id });
  await setEntryPhotos(user.id, row.id, photoIds);
  refreshAll();
  return ok({ id: row.id });
}

export async function updateJournalEntry(id: string, input: unknown, photoIds?: string[]): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await ownEntry(user.id, id))) return fail("Entry not found");
  const parsed = journalSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const refErr = await checkRefs(user.id, parsed.data.cityId, parsed.data.tripId);
  if (refErr) return fail(refErr);
  await db
    .update(journalEntries)
    .set({ ...parsed.data, updatedAt: sql`now()` })
    .where(eq(journalEntries.id, id));
  if (photoIds) await setEntryPhotos(user.id, id, photoIds);
  refreshAll();
  return ok();
}

export async function attachPhotosToEntry(id: string, photoIds: string[]): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await ownEntry(user.id, id))) return fail("Entry not found");
  const existing = await db
    .select({ photoId: journalPhotos.photoId })
    .from(journalPhotos)
    .where(eq(journalPhotos.entryId, id))
    .orderBy(journalPhotos.position);
  const merged = [...new Set([...existing.map((e) => e.photoId), ...photoIds])];
  await setEntryPhotos(user.id, id, merged);
  refreshAll();
  return ok();
}

export async function detachPhotoFromEntry(id: string, photoId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await ownEntry(user.id, id))) return fail("Entry not found");
  await db.delete(journalPhotos).where(and(eq(journalPhotos.entryId, id), eq(journalPhotos.photoId, photoId)));
  refreshAll();
  return ok();
}

/** Deletes the entry. Attached photos stay in the library. */
export async function deleteJournalEntry(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await ownEntry(user.id, id))) return fail("Entry not found");
  await db.delete(journalEntries).where(eq(journalEntries.id, id));
  refreshAll();
  redirect("/journal");
}
