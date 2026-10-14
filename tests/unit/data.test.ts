import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db";
import { albumPhotos, albums, cities, cityLogs, journalEntries, journalPhotos, photos, places, tripStops, trips, users } from "@/db/schema";
import { getMapStatuses, getStateDetail, getStats, getTrip, listAllPlaces, listMyCities, countPhotosToLocate, listMapPhotos, listPhotosPage, photoFilterFacets, searchPlaces, wishlist } from "@/lib/data";
import { buildExport } from "@/lib/export";

let me: string;
let other: string;
const ids: Record<string, number> = {};

async function city(name: string, state: string) {
  const [c] = await db.select({ id: cities.id }).from(cities).where(and(eq(cities.name, name), eq(cities.stateCode, state)));
  if (!c) throw new Error(`missing seed city ${name}, ${state}`);
  return c.id;
}

beforeAll(async () => {
  const [a] = await db.insert(users).values({ email: `me-${Date.now()}@t.dev`, name: "Me", passwordHash: "x" }).returning();
  const [b] = await db.insert(users).values({ email: `other-${Date.now()}@t.dev`, name: "Other", passwordHash: "x" }).returning();
  me = a.id;
  other = b.id;
  for (const [n, s] of [["Boston", "MA"], ["Salem", "MA"], ["Portland", "ME"], ["Burlington", "VT"], ["Washington, D.C.", "DC"], ["Honolulu", "HI"]] as const) ids[n] = await city(n, s);

  await db.insert(cityLogs).values([
    { userId: me, cityId: ids.Boston, status: "visited", visitedOn: "2024-10-04", tags: ["Food", "History"] },
    { userId: me, cityId: ids.Salem, status: "visited", visitedOn: "2024-10-06" },
    { userId: me, cityId: ids.Portland, status: "visited" },
    { userId: me, cityId: ids.Burlington, status: "want_to_visit" },
    { userId: me, cityId: ids["Washington, D.C."], status: "visited" }, // DC isn't one of the 50
    { userId: other, cityId: ids.Honolulu, status: "visited" },
  ]);
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, me));
  await db.delete(users).where(eq(users.id, other));
  await pool.end();
});

describe("travel statistics", () => {
  it("counts states (excluding DC), cities and percentages from saved records", async () => {
    const s = await getStats(me);
    expect(s.statesVisited).toBe(2); // MA, ME
    expect(s.citiesVisited).toBe(4); // includes DC as a city
    expect(s.citiesWanted).toBe(1);
    expect(s.statesWanted).toBe(1); // VT
    expect(s.percentExplored).toBe(4);
  });

  it("never mixes another user's records in", async () => {
    const mine = await getMapStatuses(me);
    expect(mine.map((c) => c.id)).not.toContain(ids.Honolulu);
    const theirs = await getStats(other);
    expect(theirs.statesVisited).toBe(1);
    expect(theirs.citiesWanted).toBe(0);
  });

  it("maps statuses to map codes", async () => {
    const mine = await getMapStatuses(me);
    const boston = mine.find((c) => c.id === ids.Boston)!;
    expect(boston.s).toBe(2);
    expect(mine.find((c) => c.id === ids.Burlington)!.s).toBe(1);
  });
});

describe("search", () => {
  it("ranks exact names first and attaches my status", async () => {
    const r = await searchPlaces(me, "Boston");
    expect(r.cities[0]).toMatchObject({ name: "Boston", state: "MA", status: "visited" });
  });

  it("finds states by name or postal code", async () => {
    expect((await searchPlaces(me, "verm")).states[0].code).toBe("VT");
    expect((await searchPlaces(me, "ca")).states.map((s) => s.code)).toContain("CA");
  });

  it("treats LIKE wildcards literally", async () => {
    expect((await searchPlaces(me, "%%%")).cities).toHaveLength(0);
  });
});

describe("lists and detail pages", () => {
  it("filters my cities by status, state and tag", async () => {
    expect((await listMyCities(me, { status: "visited", state: "MA" })).map((c) => c.name).sort()).toEqual(["Boston", "Salem"]);
    expect((await listMyCities(me, { tag: "Food" })).map((c) => c.name)).toEqual(["Boston"]);
    expect((await wishlist(me)).map((c) => c.name)).toEqual(["Burlington"]);
  });

  it("builds a state summary", async () => {
    const d = (await getStateDetail(me, "MA"))!;
    expect(d.myCities).toHaveLength(2);
    expect(d.topCities[0].name).toBe("Boston");
    expect(d.totalCities).toBeGreaterThan(100);
  });
});

describe("trips share cities without duplicating them", () => {
  it("lets one city belong to two trips and keeps a single photo album", async () => {
    const [t1] = await db.insert(trips).values({ userId: me, name: "Boston Weekend", startDate: "2024-10-04", endDate: "2024-10-06" }).returning();
    const [t2] = await db.insert(trips).values({ userId: me, name: "New England Fall Road Trip" }).returning();
    await db.insert(tripStops).values([
      { tripId: t1.id, cityId: ids.Boston, position: 0 },
      { tripId: t2.id, cityId: ids.Boston, position: 0 },
      { tripId: t2.id, cityId: ids.Portland, position: 1 },
    ]);
    const [p] = await db
      .insert(photos)
      .values({ userId: me, cityId: ids.Boston, tripId: t1.id, storageKey: `${me}/p-${Date.now()}`, mimeType: "image/jpeg", sizeBytes: 10, width: 4, height: 3 })
      .returning();

    const a = (await getTrip(me, t1.id))!;
    const b = (await getTrip(me, t2.id))!;
    expect(a.stops.map((s) => s.cityName)).toEqual(["Boston"]);
    expect(b.stops.map((s) => s.cityName)).toEqual(["Boston", "Portland"]);
    expect(a.cover).toBe(p.id); // falls back to the first trip photo
    const bostonRows = await db.select().from(cities).where(and(eq(cities.name, "Boston"), eq(cities.stateCode, "MA")));
    expect(bostonRows).toHaveLength(1);
    expect(await getTrip(other, t1.id)).toBeNull();
  });
});

describe("photo paging and export", () => {
  it("pages photos with a cursor", async () => {
    for (let i = 0; i < 5; i++) {
      await db.insert(photos).values({
        userId: me,
        storageKey: `${me}/page-${i}-${Date.now()}`,
        mimeType: "image/jpeg",
        sizeBytes: 1,
        width: 1,
        height: 1,
        createdAt: new Date(Date.UTC(2020, 0, i + 1)),
      });
    }
    const first = await listPhotosPage(me, { limit: 3 });
    expect(first.items).toHaveLength(3);
    expect(first.nextCursor).not.toBeNull();
    const second = await listPhotosPage(me, { limit: 3, before: first.nextCursor! });
    const overlap = second.items.filter((p) => first.items.some((f) => f.id === p.id));
    expect(overlap).toHaveLength(0);
  });

  it("filters the library by year and city, and counts the choices", async () => {
    const add = (cityId: number | null, takenOn: string | null, createdAt: Date, userId = me) =>
      db.insert(photos).values({ userId, cityId, takenOn, storageKey: `${userId}/f-${Math.random()}`, mimeType: "image/jpeg", sizeBytes: 1, width: 1, height: 1, createdAt });
    await add(ids.Boston, "2023-06-14", new Date(Date.UTC(2025, 2, 1)));
    await add(ids.Boston, "2023-06-15", new Date(Date.UTC(2025, 2, 2)));
    await add(ids.Boston, "2024-10-05", new Date(Date.UTC(2025, 2, 3)));
    await add(ids.Salem, "2023-07-01", new Date(Date.UTC(2025, 2, 4)));
    await add(ids.Boston, null, new Date(Date.UTC(2022, 4, 1))); // no camera date → upload year
    await add(ids.Boston, "2023-01-01", new Date(Date.UTC(2025, 2, 5)), other); // someone else's

    const boston2023 = await listPhotosPage(me, { year: 2023, cityId: ids.Boston });
    expect(boston2023.items.map((p) => p.takenOn).sort()).toEqual(["2023-06-14", "2023-06-15"]);
    expect((await listPhotosPage(me, { year: 2023 })).items).toHaveLength(3);
    expect((await listPhotosPage(me, { year: 2022, cityId: ids.Boston })).items).toHaveLength(1);
    const paged = await listPhotosPage(me, { year: 2023, limit: 2 });
    const rest = await listPhotosPage(me, { year: 2023, limit: 2, before: paged.nextCursor! });
    expect([...paged.items, ...rest.items]).toHaveLength(3);

    const facets = await photoFilterFacets(me);
    const n = (year: number, cityId: number) => facets.find((f) => f.year === year && f.cityId === cityId)?.count ?? 0;
    expect(n(2023, ids.Boston)).toBe(2);
    expect(n(2023, ids.Salem)).toBe(1);
    expect(n(2022, ids.Boston)).toBe(1);
    expect(facets.find((f) => f.cityId === ids.Boston)?.cityName).toBe("Boston");
    expect(facets.reduce((s, f) => s + f.count, 0)).toBe((await listPhotosPage(me, { limit: 200 })).items.length);
  });

  it("lists located photos for the map and counts older photos still to check", async () => {
    const add = (v: { lat?: number | null; lon?: number | null; gpsChecked?: boolean }, userId = me) =>
      db.insert(photos).values({ userId, cityId: ids.Boston, storageKey: `${userId}/loc-${Math.random()}`, mimeType: "image/jpeg", sizeBytes: 1, width: 1, height: 1, ...v });
    const before = (await listMapPhotos(me)).length;
    const toCheck = await countPhotosToLocate(me);
    await add({ lat: 42.3601, lon: -71.0589 });
    await add({ lat: null, lon: null });
    await add({ gpsChecked: false });
    await add({ lat: 21.3, lon: -157.8 }, other);
    const map = await listMapPhotos(me);
    expect(map).toHaveLength(before + 1);
    expect(map.every((p) => p.lat !== null && p.lon !== null)).toBe(true);
    expect(map.find((p) => p.lat === 42.3601)?.cityName).toBe("Boston");
    expect(await countPhotosToLocate(me)).toBe(toCheck + 1);
  });

  it("exports every kind of record for the owner only", async () => {
    const [al] = await db.insert(albums).values({ userId: me, title: "Boston Trip" }).returning();
    const [ph] = await db.select().from(photos).where(eq(photos.userId, me)).limit(1);
    await db.insert(albumPhotos).values({ albumId: al.id, photoId: ph.id });
    const [je] = await db.insert(journalEntries).values({ userId: me, title: "Harbor walk", entryDate: "2024-10-05", cityId: ids.Boston }).returning();
    await db.insert(journalPhotos).values({ entryId: je.id, photoId: ph.id });
    await db.insert(places).values({ userId: me, cityId: ids.Boston, name: "Neptune Oyster", category: "restaurant", address: "63 Salem St" });
    await db.insert(places).values({ userId: me, cityId: ids.Boston, name: "Museum of Fine Arts", category: "museum", lat: 42.3394, lon: -71.0940 });
    await db.insert(places).values({ userId: other, cityId: ids.Boston, name: "Someone else's spot", category: "bar" });

    const all = await listAllPlaces(me);
    expect(all.map((p) => p.name).sort()).toEqual(["Museum of Fine Arts", "Neptune Oyster"]);
    expect((await listAllPlaces(me, { category: "museum" })).map((p) => p.name)).toEqual(["Museum of Fine Arts"]);
    expect((await listAllPlaces(me, { q: "salem" })).map((p) => p.name)).toEqual(["Neptune Oyster"]);
    expect(await listAllPlaces(me, { state: "CA" })).toHaveLength(0);

    const ex = await buildExport(me);
    expect(ex.format).toBe("us-travel-journal");
    expect(ex.user).not.toHaveProperty("passwordHash");
    expect(ex.cityLogs).toHaveLength(5);
    expect(ex.trips.map((t) => t.name).sort()).toEqual(["Boston Weekend", "New England Fall Road Trip"]);
    expect(ex.albumPhotos).toHaveLength(1);
    expect(ex.journalPhotos).toHaveLength(1);
    expect(ex.places.map((p) => p.name).sort()).toEqual(["Museum of Fine Arts", "Neptune Oyster"]);
    expect(ex.places.find((p) => p.name === "Neptune Oyster")?.address).toBe("63 Salem St");
    expect(ex.cities.find((c) => c.id === ids.Boston)).toMatchObject({ name: "Boston", stateCode: "MA" });
    expect(ex.cityLogs.every((l) => l.userId === me)).toBe(true);
  });
});
