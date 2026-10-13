import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail } from "@/lib/action-result";
import { fieldErrors } from "@/lib/validation";

export function invalid(error: z.ZodError) {
  const fe = fieldErrors(error);
  return fail(Object.values(fe)[0] ?? "Check the highlighted fields", fe);
}

/** Every mutation can affect the map, dashboard and lists, so refresh all routes. */
export function refreshAll() {
  revalidatePath("/", "layout");
}

export const uuidSchema = z.string().uuid();
export const cityIdSchema = z.number().int().positive();
