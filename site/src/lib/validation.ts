import { z } from "zod";
import { PLACE_CATEGORY_LABEL } from "./constants";

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD")
  .refine((v) => !Number.isNaN(Date.parse(v)), "That date doesn't exist");

/** "" → null, otherwise a valid ISO date */
export const optionalDate = z
  .union([z.literal(""), isoDate])
  .nullish()
  .transform((v) => (v ? v : null));

const optionalText = (max: number) =>
  z
    .string()
    .nullish()
    .transform((v) => (v ?? "").trim())
    .pipe(z.string().max(max, `Keep this under ${max.toLocaleString()} characters`))
    .transform((v) => (v === "" ? null : v));

export const tagList = z
  .array(z.string().trim().min(1).max(40))
  .max(20, "Use at most 20 tags")
  .transform((tags) => [...new Set(tags)]);

export const textList = z.array(z.string().trim().min(1).max(200)).max(100).transform((v) => [...new Set(v)]);

const dateOrder = <T extends Record<string, unknown>>(a: keyof T, b: keyof T, msg: string) =>
  (v: T, ctx: z.RefinementCtx) => {
    if (v[a] && v[b] && String(v[b]) < String(v[a])) ctx.addIssue({ code: "custom", path: [b as string], message: msg });
  };

export const signupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(10, "Use at least 10 characters").max(200),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export const visitStatusSchema = z.enum(["not_visited", "want_to_visit", "visited"]);

export const cityLogSchema = z
  .object({
    status: visitStatusSchema.optional(),
    visitedOn: optionalDate,
    visitedUntil: optionalDate,
    rating: z
      .union([z.literal(""), z.coerce.number().int().min(1).max(5)])
      .nullish()
      .transform((v) => (typeof v === "number" ? v : null)),
    impression: optionalText(300),
    notes: optionalText(20_000),
    tags: tagList.default([]),
  })
  .superRefine(dateOrder("visitedOn", "visitedUntil", "The last day can't be before the first day"));

export const placeSchema = z.object({
  name: z.string().trim().min(1, "Give the place a name").max(120),
  category: z.enum(Object.keys(PLACE_CATEGORY_LABEL) as [keyof typeof PLACE_CATEGORY_LABEL]),
  address: optionalText(300),
  notes: optionalText(2000),
  url: z
    .union([z.literal(""), z.string().trim().url("Enter a full link starting with https://")])
    .nullish()
    .transform((v) => v || null),
  lat: z.union([z.number().min(-90).max(90), z.null()]).default(null),
  lon: z.union([z.number().min(-180).max(180), z.null()]).default(null),
  favorite: z.boolean().default(false),
});

export const tripSchema = z
  .object({
    name: z.string().trim().min(1, "Give the trip a name").max(120),
    startDate: optionalDate,
    endDate: optionalDate,
    summary: optionalText(300),
    notes: optionalText(20_000),
  })
  .superRefine(dateOrder("startDate", "endDate", "The trip can't end before it starts"));

export const tripStopSchema = z
  .object({
    cityId: z.number().int().positive(),
    arriveOn: optionalDate,
    departOn: optionalDate,
    notes: optionalText(2000),
  })
  .superRefine(dateOrder("arriveOn", "departOn", "Departure can't be before arrival"));

export const albumSchema = z.object({
  title: z.string().trim().min(1, "Give the album a title").max(120),
  description: optionalText(2000),
  tripId: z
    .union([z.literal(""), z.string().uuid()])
    .nullish()
    .transform((v) => v || null),
});

export const journalSchema = z.object({
  title: z.string().trim().min(1, "Give the entry a title").max(160),
  entryDate: isoDate,
  cityId: z.union([z.number().int().positive(), z.null()]).default(null),
  tripId: z
    .union([z.literal(""), z.string().uuid()])
    .nullish()
    .transform((v) => v || null),
  body: z.string().max(100_000, "This entry is too long").default(""),
  highlights: optionalText(5000),
  placesVisited: textList.default([]),
  tags: tagList.default([]),
});

export const photoMetaSchema = z.object({
  caption: optionalText(200),
  description: optionalText(5000),
  takenOn: optionalDate,
});

export const stateNotesSchema = z.object({ notes: optionalText(20_000) });

export const customCitySchema = z.object({
  name: z.string().trim().min(1, "Enter the city name").max(120),
  stateCode: z.string().length(2),
  lat: z.number().min(17).max(72),
  lon: z.number().min(-180).max(-64),
});

export type FieldErrors = Record<string, string>;

export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    out[key] ??= issue.message;
  }
  return out;
}
