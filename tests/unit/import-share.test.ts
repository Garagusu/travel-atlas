import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ZipArchive } from "archiver";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const tmp = mkdtempSync(path.join(os.tmpdir(), "tj-import-"));
process.env.STORAGE_DIR = path.join(tmp, "uploads");

const { db, pool } = await import("@/db");
const { albums, cities, cityLogs, journalEntries, photos, places, shareLinks, trips, users } = await import("@/db/schema");
const { importBackup, ImportError } = await import("@/lib/import");
const { getSharedList, nearestCity } = await import("@/lib/data");
const { processImage } = await import("@/lib/images");

let me: string;
let boston: { id: number; geonameId: number | null };

async function makeZip(file: string, data: object, photosByPath: Record<string, Buffer>) {
  const { createWriteStream } = await import("node:fs");
  await new Promise<void>((res, rej) => {
    const out = createWriteStream(file);
    const a = new ZipArchive();
    out.on("close", () => res());
    a.on("error", rej);
    a.pipe(out);
    a.append(JSON.stringify(data), { name: "data.json" });
    for (const [name, buf] of Object.entries(photosByPath)) a.append(buf, { name });
    void a.finalize();
  });
}

beforeAll(async () => {
  const [u] = await db.insert(users).values({ email: `imp-${Date.now()}@t.dev`, name: "Grace Hopper", passwordHash: "x" }).returning();
  me = u.id;
  const [b] = await db.select({ id: cities.id, geonameId: cities.geonameId }).from(cities).where(and(eq(cities.name, "Boston"), eq(cities.stateCode, "MA")));
  boston = b;
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, me));
  await db.delete(cities).where(eq(cities.createdBy, me));
  await pool.end();
  rmSync(tmp, { recursive: true, force: true });
});

describe("restoring a GitHub Pages backup into the full app", () => {
  it("maps GeoNames cities, creates custom towns and regenerates photos", async () => {
    const jpg = readFileSync("tests/fixtures/landscape.jpg");
    const custom = 1_000_000_007;
    const zipFile = path.join(tmp, "pages.zip");
    await makeZip(
      zipFile,
      {
        format: "travel-atlas-backup",
        version: 1,
        customCities: [{ id: custom, name: "Tinyville", state: "VT", lat: 44.1, lon: -72.6 }],
        cityLogs: [
          { cityId: boston.geonameId, status: "visited", rating: 5, notes: "Chowder.", tags: ["Food"], coverPhotoId: "p1" },
          { cityId: custom, status: "want_to_visit" },
        ],
        stateLogs: [{ code: "MA", notes: "Lovely." }],
        places: [{ id: "pl1", cityId: boston.geonameId, name: "Neptune Oyster", category: "restaurant", favorite: true, lat: 42.36, lon: -71.05 }],
        trips: [{ id: "t1", name: "Fall trip", coverPhotoId: "p1" }],
        tripStops: [{ tripId: "t1", cityId: boston.geonameId, position: 0 }, { tripId: "t1", cityId: custom, position: 1 }],
        photos: [{ id: "p1", cityId: boston.geonameId, tripId: "t1", caption: "Harbor", position: 0 }, { id: "missing", cityId: custom }],
        albums: [{ id: "a1", title: "Best of", coverPhotoId: "p1" }],
        albumPhotos: [{ albumId: "a1", photoId: "p1", position: 0 }],
        journal: [{ id: "j1", title: "Day one", entryDate: "2024-10-04", cityId: boston.geonameId, body: "Walked.", tags: [] }],
        journalPhotos: [{ entryId: "j1", photoId: "p1", position: 0 }],
      },
      { "photos/p1/original": jpg, "photos/p1/thumb": jpg },
    );
    const r = await importBackup(me, zipFile);
    expect(r).toMatchObject({ format: "pages", cities: 2, places: 1, trips: 1, albums: 1, journalEntries: 1, photos: 1, photosSkipped: 1 });

    const logs = await db.select().from(cityLogs).where(eq(cityLogs.userId, me));
    const bLog = logs.find((l) => l.cityId === boston.id)!;
    expect(bLog).toMatchObject({ status: "visited", rating: 5, notes: "Chowder." });
    const [photo] = await db.select().from(photos).where(eq(photos.userId, me));
    expect(bLog.coverPhotoId).toBe(photo.id);
    expect(photo.caption).toBe("Harbor");
    const [tiny] = await db.select().from(cities).where(eq(cities.createdBy, me));
    expect(tiny).toMatchObject({ name: "Tinyville", stateCode: "VT" });
    expect((await db.select().from(trips).where(eq(trips.userId, me)))[0].coverPhotoId).toBe(photo.id);
    expect(await db.select().from(albums).where(eq(albums.userId, me))).toHaveLength(1);
    expect(await db.select().from(journalEntries).where(eq(journalEntries.userId, me))).toHaveLength(1);

    // restoring again replaces rather than duplicates
    await importBackup(me, zipFile);
    expect(await db.select().from(places).where(eq(places.userId, me))).toHaveLength(1);
    expect(await db.select().from(photos).where(eq(photos.userId, me))).toHaveLength(1);
    expect(await db.select().from(cities).where(eq(cities.createdBy, me))).toHaveLength(1);
  });

  it("rejects files that aren't backups", async () => {
    const bad = path.join(tmp, "bad.zip");
    await makeZip(bad, { format: "something-else" }, {});
    await expect(importBackup(me, bad)).rejects.toBeInstanceOf(ImportError);
    const notZip = path.join(tmp, "x.zip");
    writeFileSync(notZip, "hello");
    await expect(importBackup(me, notZip)).rejects.toThrow();
  });
});

describe("photo location", () => {
  it("reads GPS from EXIF and finds the nearest city", async () => {
    const img = await processImage(readFileSync("tests/fixtures/with-gps.jpg"));
    expect(img.gps?.lat).toBeCloseTo(37.808, 3);
    expect(img.gps?.lon).toBeCloseTo(-122.4177, 3);
    expect((await processImage(readFileSync("tests/fixtures/landscape.jpg"))).gps).toBeNull();
    const c = await nearestCity(me, img.gps!.lat, img.gps!.lon);
    expect(c).toMatchObject({ name: "San Francisco", stateCode: "CA" });
    expect(await nearestCity(me, 30, -140)).toBeNull(); // middle of the Pacific
  });
});

describe("share links", () => {
  it("shows a city's places to anyone with the token until turned off", async () => {
    await db.insert(shareLinks).values({ id: "tok_abcdefghijklmn", userId: me, cityId: boston.id });
    const list = await getSharedList("tok_abcdefghijklmn");
    expect(list?.ownerFirstName).toBe("Grace");
    expect(list?.city?.name).toBe("Boston");
    expect(list?.places.map((p) => p.name)).toEqual(["Neptune Oyster"]);
    expect(await getSharedList("does-not-exist-123")).toBeNull();
    expect(await getSharedList("../../etc/passwd")).toBeNull();
    await db.update(shareLinks).set({ revokedAt: new Date() }).where(eq(shareLinks.id, "tok_abcdefghijklmn"));
    expect(await getSharedList("tok_abcdefghijklmn")).toBeNull();
  });
});
