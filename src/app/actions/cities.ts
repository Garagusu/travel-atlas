"use server";

import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { cities, cityLogs, photos, places, stateLogs } from "@/db/schema";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { isValidStateCode } from "@/lib/geo/states-meta";
import {
  cityLogSchema,
  customCitySchema,
  placeSchema,
  stateNotesSchema,
  visitStatusSchema,
} from "@/lib/validation";
import { cityIdSchema, invalid, refreshAll, uuidSchema } from "./helpers";

async function cityVisible(userId: string, cityId: number) {
  const [c] = await db
    .select({ id: cities.id })
    .from(cities)
    .where(and(eq(cities.id, cityId), or(isNull(cities.createdBy), eq(cities.createdBy, userId))))
    .limit(1);
  return !!c;
}

export async function setCityStatus(cityId: number, status: string): Promise<ActionResult> {
  const user = await requireUser();
  const id = cityIdSchema.safeParse(cityId);
  const st = visitStatusSchema.safeParse(status);
  if (!id.success || !st.success) return fail("Invalid city or status");
  if (!(await cityVisible(user.id, id.data))) return fail("City not found");
  await db
    .insert(cityLogs)
    .values({ userId: user.id, cityId: id.data, status: st.data })
    .onConflictDoUpdate({
      target: [cityLogs.userId, cityLogs.cityId],
      set: { status: st.data, updatedAt: sql`now()` },
    });
  refreshAll();
  return ok();
}

export async function saveCityLog(cityId: number, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const id = cityIdSchema.safeParse(cityId);
  if (!id.success || !(await cityVisible(user.id, id.data))) return fail("City not found");
  const parsed = cityLogSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { status, ...v } = parsed.data;
  // Without an explicit status, entering a visit date marks the city as visited.
  const insertStatus = status ?? (v.visitedOn ? "visited" : "not_visited");
  const updateStatus = status
    ? sql`${status}::visit_status`
    : v.visitedOn
      ? sql`'visited'::visit_status`
      : sql`${cityLogs.status}`;
  await db
    .insert(cityLogs)
    .values({ userId: user.id, cityId: id.data, status: insertStatus, ...v })
    .onConflictDoUpdate({
      target: [cityLogs.userId, cityLogs.cityId],
      set: { ...v, status: updateStatus, updatedAt: sql`now()` },
    });
  refreshAll();
  return ok();
}

/** Removes the journal record for a city (status, notes, rating, tags, saved places). Photos are kept. */
export async function clearCityLog(cityId: number): Promise<ActionResult> {
  const user = await requireUser();
  const id = cityIdSchema.safeParse(cityId);
  if (!id.success) return fail("Invalid city");
  await db.transaction(async (tx) => {
    await tx.delete(cityLogs).where(and(eq(cityLogs.userId, user.id), eq(cityLogs.cityId, id.data)));
    await tx.delete(places).where(and(eq(places.userId, user.id), eq(places.cityId, id.data)));
  });
  refreshAll();
  return ok();
}

export async function setCityCover(cityId: number, photoId: string): Promise<ActionResult> {
  const user = await requireUser();
  const pid = uuidSchema.safeParse(photoId);
  if (!pid.success) return fail("Invalid photo");
  const [p] = await db
    .select({ id: photos.id })
    .from(photos)
    .where(and(eq(photos.id, pid.data), eq(photos.userId, user.id), eq(photos.cityId, cityId)))
    .limit(1);
  if (!p) return fail("That photo isn't in this city's album");
  await db
    .insert(cityLogs)
    .values({ userId: user.id, cityId, coverPhotoId: p.id })
    .onConflictDoUpdate({ target: [cityLogs.userId, cityLogs.cityId], set: { coverPhotoId: p.id, updatedAt: sql`now()` } });
  refreshAll();
  return ok();
}

export async function addCustomCity(input: unknown): Promise<ActionResult<{ id: number }>> {
  const user = await requireUser();
  const parsed = customCitySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data;
  if (!isValidStateCode(v.stateCode)) return fail("Choose a state", { stateCode: "Choose a state" });
  const [existing] = await db
    .select({ id: cities.id })
    .from(cities)
    .where(
      and(
        sql`lower(${cities.name}) = lower(${v.name})`,
        eq(cities.stateCode, v.stateCode.toUpperCase()),
        or(isNull(cities.createdBy), eq(cities.createdBy, user.id)),
      ),
    )
    .limit(1);
  if (existing) return ok({ id: existing.id });
  const [row] = await db
    .insert(cities)
    .values({ name: v.name, stateCode: v.stateCode.toUpperCase(), lat: v.lat, lon: v.lon, population: 0, createdBy: user.id })
    .returning({ id: cities.id });
  await db.insert(cityLogs).values({ userId: user.id, cityId: row.id, status: "not_visited" });
  refreshAll();
  return ok({ id: row.id });
}

/* ------------------------------ places ------------------------------ */

export async function addPlace(cityId: number, input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  if (!(await cityVisible(user.id, cityId))) return fail("City not found");
  const parsed = placeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const [row] = await db
    .insert(places)
    .values({ ...parsed.data, userId: user.id, cityId })
    .returning({ id: places.id });
  refreshAll();
  return ok({ id: row.id });
}

export async function updatePlace(placeId: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = placeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const res = await db
    .update(places)
    .set(parsed.data)
    .where(and(eq(places.id, placeId), eq(places.userId, user.id)))
    .returning({ id: places.id });
  if (!res.length) return fail("Place not found");
  refreshAll();
  return ok();
}

export async function deletePlace(placeId: string): Promise<ActionResult> {
  const user = await requireUser();
  const pid = uuidSchema.safeParse(placeId);
  if (!pid.success) return fail("Invalid place");
  await db.delete(places).where(and(eq(places.id, pid.data), eq(places.userId, user.id)));
  refreshAll();
  return ok();
}

/* ------------------------------ states ------------------------------ */

export async function saveStateNotes(stateCode: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (!isValidStateCode(stateCode)) return fail("Unknown state");
  const parsed = stateNotesSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  await db
    .insert(stateLogs)
    .values({ userId: user.id, stateCode: stateCode.toUpperCase(), notes: parsed.data.notes })
    .onConflictDoUpdate({
      target: [stateLogs.userId, stateLogs.stateCode],
      set: { notes: parsed.data.notes, updatedAt: sql`now()` },
    });
  refreshAll();
  return ok();
}

export async function setStateCover(stateCode: string, photoId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!isValidStateCode(stateCode)) return fail("Unknown state");
  const [p] = await db
    .select({ id: photos.id })
    .from(photos)
    .innerJoin(cities, eq(cities.id, photos.cityId))
    .where(and(eq(photos.id, photoId), eq(photos.userId, user.id), eq(cities.stateCode, stateCode.toUpperCase())))
    .limit(1);
  if (!p) return fail("That photo isn't from this state");
  await db
    .insert(stateLogs)
    .values({ userId: user.id, stateCode: stateCode.toUpperCase(), coverPhotoId: p.id })
    .onConflictDoUpdate({ target: [stateLogs.userId, stateLogs.stateCode], set: { coverPhotoId: p.id, updatedAt: sql`now()` } });
  refreshAll();
  return ok();
}
