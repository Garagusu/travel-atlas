import { describe, expect, it } from "vitest";
import { cityLogSchema, journalSchema, placeSchema, signupSchema, tripSchema } from "@/lib/validation";

describe("validation", () => {
  it("normalises signup input", () => {
    const r = signupSchema.safeParse({ name: " Ana ", email: " ANA@Example.com ", password: "long-enough-pw" });
    expect(r.success && r.data).toEqual({ name: "Ana", email: "ana@example.com", password: "long-enough-pw" });
  });

  it("rejects short passwords", () => {
    expect(signupSchema.safeParse({ name: "A", email: "a@b.co", password: "short" }).success).toBe(false);
  });

  it("turns empty optional fields into null and dedupes tags", () => {
    const r = cityLogSchema.parse({ visitedOn: "", visitedUntil: "", rating: "", impression: "  ", notes: "", tags: ["Food", "Food", "Hiking"] });
    expect(r).toMatchObject({ visitedOn: null, visitedUntil: null, rating: null, impression: null, notes: null, tags: ["Food", "Hiking"] });
  });

  it("rejects a visit that ends before it starts", () => {
    const r = cityLogSchema.safeParse({ visitedOn: "2024-05-10", visitedUntil: "2024-05-01", tags: [] });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(["visitedUntil"]);
  });

  it("rejects impossible dates and out-of-range ratings", () => {
    expect(cityLogSchema.safeParse({ visitedOn: "2024-02-31x", tags: [] }).success).toBe(false);
    expect(cityLogSchema.safeParse({ rating: 6, tags: [] }).success).toBe(false);
  });

  it("validates trips", () => {
    expect(tripSchema.safeParse({ name: "", startDate: "", endDate: "" }).success).toBe(false);
    expect(tripSchema.safeParse({ name: "Boston Weekend", startDate: "2024-09-01", endDate: "2024-08-30" }).success).toBe(false);
    expect(tripSchema.parse({ name: "Boston Weekend", startDate: "2024-09-01", endDate: "2024-09-03" }).name).toBe("Boston Weekend");
  });

  it("validates places and links", () => {
    expect(placeSchema.safeParse({ name: "Neptune Oyster", category: "restaurant", url: "not a url" }).success).toBe(false);
    const ok = placeSchema.parse({ name: "Neptune Oyster", category: "restaurant", url: "" });
    expect(ok).toMatchObject({ url: null, lat: null, lon: null, favorite: false });
  });

  it("requires a journal title and real date", () => {
    expect(journalSchema.safeParse({ title: "", entryDate: "2024-01-01" }).success).toBe(false);
    expect(journalSchema.safeParse({ title: "Day one", entryDate: "yesterday" }).success).toBe(false);
    expect(journalSchema.parse({ title: "Day one", entryDate: "2024-01-01", tripId: "" }).tripId).toBeNull();
  });
});
