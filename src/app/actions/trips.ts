"use server";

import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { cities, photos, tripStops, trips } from "@/db/schema";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { tripSchema, tripStopSchema } from "@/lib/validation";
import { invalid, refreshAll, uuidSchema } from "./helpers";

async function ownTrip(userId: string, tripId: string) {
  if (!uuidSchema.safeParse(tripId).success) return false;
  const [t] = await db
    .select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
    .limit(1);
  return !!t;
}

export async function createTrip(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = tripSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const [row] = await db.insert(trips).values({ ...parsed.data, userId: user.id }).returning({ id: trips.id });
  refreshAll();
  return ok({ id: row.id });
}

export async function updateTrip(tripId: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await ownTrip(user.id, tripId))) return fail("Trip not found");
  const parsed = tripSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  await db.update(trips).set({ ...parsed.data, updatedAt: sql`now()` }).where(eq(trips.id, tripId));
  refreshAll();
  return ok();
}

/** Deletes the trip and its itinerary. Photos and journal entries are kept (unlinked from the trip). */
export async function deleteTrip(tripId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await ownTrip(user.id, tripId))) return fail("Trip not found");
  await db.delete(trips).where(eq(trips.id, tripId));
  refreshAll();
  redirect("/trips");
}

export async function addTripStop(tripId: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await ownTrip(user.id, tripId))) return fail("Trip not found");
  const parsed = tripStopSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const [city] = await db
    .select({ id: cities.id })
    .from(cities)
    .where(and(eq(cities.id, parsed.data.cityId), or(isNull(cities.createdBy), eq(cities.createdBy, user.id))))
    .limit(1);
  if (!city) return fail("City not found");
  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${tripStops.position}) + 1, 0)::int` })
    .from(tripStops)
    .where(eq(tripStops.tripId, tripId));
  await db.insert(tripStops).values({ tripId, ...parsed.data, position: next });
  refreshAll();
  return ok();
}

export async function updateTripStop(stopId: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = tripStopSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const [stop] = await db
    .select({ id: tripStops.id })
    .from(tripStops)
    .innerJoin(trips, eq(trips.id, tripStops.tripId))
    .where(and(eq(tripStops.id, stopId), eq(trips.userId, user.id)))
    .limit(1);
  if (!stop) return fail("Stop not found");
  const { arriveOn, departOn, notes } = parsed.data;
  await db.update(tripStops).set({ arriveOn, departOn, notes }).where(eq(tripStops.id, stopId));
  refreshAll();
  return ok();
}

export async function removeTripStop(stopId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!uuidSchema.safeParse(stopId).success) return fail("Invalid stop");
  await db
    .delete(tripStops)
    .where(and(eq(tripStops.id, stopId), sql`${tripStops.tripId} in (select id from trips where user_id = ${user.id})`));
  refreshAll();
  return ok();
}

export async function reorderTripStops(tripId: string, stopIds: string[]): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await ownTrip(user.id, tripId))) return fail("Trip not found");
  const ids = z.array(z.string().uuid()).max(500).safeParse(stopIds);
  if (!ids.success) return fail("Invalid order");
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.data.entries()) {
      await tx.update(tripStops).set({ position: i }).where(and(eq(tripStops.id, id), eq(tripStops.tripId, tripId)));
    }
  });
  refreshAll();
  return ok();
}

export async function setTripCover(tripId: string, photoId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await ownTrip(user.id, tripId))) return fail("Trip not found");
  const [p] = await db
    .select({ id: photos.id })
    .from(photos)
    .where(and(eq(photos.id, photoId), eq(photos.userId, user.id)))
    .limit(1);
  if (!p) return fail("Photo not found");
  await db.update(trips).set({ coverPhotoId: p.id, updatedAt: sql`now()` }).where(eq(trips.id, tripId));
  refreshAll();
  return ok();
}

/** Link existing photos to a trip (e.g. from a city album). */
export async function addPhotosToTrip(tripId: string, photoIds: string[]): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await ownTrip(user.id, tripId))) return fail("Trip not found");
  const ids = z.array(z.string().uuid()).min(1).max(1000).safeParse(photoIds);
  if (!ids.success) return fail("Choose at least one photo");
  await db
    .update(photos)
    .set({ tripId })
    .where(and(eq(photos.userId, user.id), inArray(photos.id, ids.data)));
  refreshAll();
  return ok();
}
