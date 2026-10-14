"use server";

import { randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { shareLinks } from "@/db/schema";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { refreshAll } from "./helpers";

/** Returns the active share link for a city's picks (or all places), creating one if needed. */
export async function getShareLink(cityId: number | null): Promise<ActionResult<{ path: string }>> {
  const user = await requireUser();
  if (cityId !== null && (!Number.isInteger(cityId) || cityId <= 0)) return fail("Invalid city");
  const [existing] = await db
    .select({ id: shareLinks.id })
    .from(shareLinks)
    .where(and(eq(shareLinks.userId, user.id), cityId === null ? isNull(shareLinks.cityId) : eq(shareLinks.cityId, cityId), isNull(shareLinks.revokedAt)))
    .limit(1);
  if (existing) return ok({ path: `/s/${existing.id}` });
  const id = randomBytes(12).toString("base64url");
  await db.insert(shareLinks).values({ id, userId: user.id, cityId });
  refreshAll();
  return ok({ path: `/s/${id}` });
}

/** Turns a share link off; anyone opening it sees "no longer shared". */
export async function revokeShareLink(id: string): Promise<ActionResult> {
  const user = await requireUser();
  await db
    .update(shareLinks)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(shareLinks.id, id), eq(shareLinks.userId, user.id)));
  refreshAll();
  return ok();
}
