import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import yauzl from "yauzl";
import { db } from "@/db";
import {
  albumPhotos,
  albums,
  cities,
  cityLogs,
  journalEntries,
  journalPhotos,
  photos,
  places,
  stateLogs,
  tripStops,
  trips,
} from "@/db/schema";
import { STATE_BY_CODE } from "./geo/states-meta";
import { processImage, variantKey } from "./images";
import { storage } from "./storage";

/* Restores a backup ZIP into one account, replacing that account's data.
   Accepts both the full app's backups ("us-travel-journal") and the GitHub
   Pages edition's backups ("travel-atlas-backup"), so a journal started in
   the browser can move to the server. Every record gets a fresh id. */

export class ImportError extends Error {}

type Zip = yauzl.ZipFile;
const openZip = (file: string) =>
  new Promise<Zip>((res, rej) => yauzl.open(file, { lazyEntries: true, autoClose: false }, (e, z) => (e ? rej(e) : res(z!))));

async function indexEntries(zip: Zip) {
  const entries = new Map<string, yauzl.Entry>();
  await new Promise<void>((res, rej) => {
    zip.on("entry", (e: yauzl.Entry) => {
      if (!e.fileName.endsWith("/")) entries.set(e.fileName, e);
      zip.readEntry();
    });
    zip.on("end", res);
    zip.on("error", rej);
    zip.readEntry();
  });
  return entries;
}

const readEntry = (zip: Zip, entry: yauzl.Entry) =>
  new Promise<Buffer>((res, rej) =>
    zip.openReadStream(entry, (err, stream) => {
      if (err || !stream) return rej(err);
      const chunks: Buffer[] = [];
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", () => res(Buffer.concat(chunks)));
      stream.on("error", rej);
    }),
  );

type Any = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.length ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const arr = (v: unknown) => (Array.isArray(v) ? (v as Any[]) : []);
const strArr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const ts = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v) : new Date());
const STATUS = new Set(["not_visited", "want_to_visit", "visited"]);
const CATEGORIES = new Set(["restaurant", "museum", "attraction", "activity", "cafe", "bar", "hotel", "park", "shop", "other"]);

export type ImportSummary = {
  format: "full" | "pages";
  cities: number;
  places: number;
  trips: number;
  albums: number;
  journalEntries: number;
  photos: number;
  photosSkipped: number;
};

export async function importBackup(userId: string, zipPath: string, onProgress?: (msg: string) => void): Promise<ImportSummary> {
  const zip = await openZip(zipPath);
  try {
    const entries = await indexEntries(zip);
    const dataEntry = entries.get("data.json");
    if (!dataEntry) throw new ImportError("This isn't a Travel Atlas backup: data.json is missing.");
    let data: Any;
    try {
      data = JSON.parse((await readEntry(zip, dataEntry)).toString("utf8"));
    } catch {
      throw new ImportError("The backup's data.json can't be read.");
    }
    const format = data.format === "us-travel-journal" ? "full" : data.format === "travel-atlas-backup" ? "pages" : null;
    if (!format) throw new ImportError("This isn't a Travel Atlas backup.");

    /* ---------- normalise both formats ---------- */
    type CityRef = { key: string; geonameId: number | null; name: string; state: string; lat: number; lon: number };
    const cityRefs = new Map<string, CityRef>();
    let logs: Any[], stateRows: Any[], placeRows: Any[], tripRows: Any[], stopRows: Any[], photoRows: Any[];
    let albumRows: Any[], albumLinks: Any[], entryRows: Any[], entryLinks: Any[];
    const photoFile = new Map<string, string>(); // old photo id -> zip entry of the original

    if (format === "full") {
      for (const c of arr(data.cities)) {
        cityRefs.set(String(c.id), {
          key: String(c.id),
          geonameId: num(c.geonameId),
          name: String(c.name),
          state: String(c.stateCode),
          lat: Number(c.lat),
          lon: Number(c.lon),
        });
      }
      logs = arr(data.cityLogs);
      stateRows = arr(data.stateLogs);
      placeRows = arr(data.places);
      tripRows = arr(data.trips);
      stopRows = arr(data.tripStops);
      photoRows = arr(data.photos);
      albumRows = arr(data.albums);
      albumLinks = arr(data.albumPhotos);
      entryRows = arr(data.journalEntries);
      entryLinks = arr(data.journalPhotos);
      for (const name of entries.keys()) {
        const m = name.match(/^photos\/([^/]+)\/original\.\w+$/);
        if (m) photoFile.set(m[1], name);
      }
    } else {
      // Pages edition: city ids are GeoNames ids; custom towns have ids ≥ 1e9.
      const custom = new Map(arr(data.customCities).map((c) => [String(c.id), c]));
      const key = (id: unknown) => String(id);
      const refFor = (id: unknown) => {
        const k = key(id);
        if (cityRefs.has(k)) return;
        const c = custom.get(k);
        if (c) cityRefs.set(k, { key: k, geonameId: null, name: String(c.name), state: String(c.state), lat: Number(c.lat), lon: Number(c.lon) });
        else if (Number(id) > 0 && Number(id) < 1e9) cityRefs.set(k, { key: k, geonameId: Number(id), name: "", state: "", lat: 0, lon: 0 });
      };
      logs = arr(data.cityLogs);
      stateRows = arr(data.stateLogs).map((s) => ({ ...s, stateCode: s.code }));
      placeRows = arr(data.places);
      tripRows = arr(data.trips);
      stopRows = arr(data.tripStops);
      photoRows = arr(data.photos);
      albumRows = arr(data.albums);
      albumLinks = arr(data.albumPhotos);
      entryRows = arr(data.journal);
      entryLinks = arr(data.journalPhotos);
      for (const r of [...logs, ...placeRows, ...stopRows, ...photoRows, ...entryRows]) if (r.cityId != null) refFor(r.cityId);
      for (const name of entries.keys()) {
        const m = name.match(/^photos\/([^/]+)\/original$/);
        if (m) photoFile.set(m[1], name);
      }
    }

    /* ---------- resolve cities in this database ---------- */
    const cityMap = new Map<string, number>();
    const geoIds = [...cityRefs.values()].flatMap((c) => (c.geonameId ? [c.geonameId] : []));
    const found = geoIds.length
      ? await db.select({ id: cities.id, geonameId: cities.geonameId }).from(cities).where(inArray(cities.geonameId, geoIds))
      : [];
    const byGeo = new Map(found.map((f) => [f.geonameId!, f.id]));
    for (const c of cityRefs.values()) {
      if (c.geonameId && byGeo.has(c.geonameId)) {
        cityMap.set(c.key, byGeo.get(c.geonameId)!);
        continue;
      }
      if (!c.name || !STATE_BY_CODE.has(c.state)) continue;
      // custom town (or a city missing from this database): reuse by name, else create
      const [existing] = await db
        .select({ id: cities.id })
        .from(cities)
        .where(and(sql`lower(${cities.name}) = lower(${c.name})`, eq(cities.stateCode, c.state), or(isNull(cities.createdBy), eq(cities.createdBy, userId))))
        .limit(1);
      if (existing) cityMap.set(c.key, existing.id);
      else {
        const [row] = await db.insert(cities).values({ name: c.name, stateCode: c.state, lat: c.lat, lon: c.lon, population: 0, createdBy: userId }).returning({ id: cities.id });
        cityMap.set(c.key, row.id);
      }
    }
    const city = (id: unknown) => (id == null ? null : (cityMap.get(String(id)) ?? null));

    /* ---------- clear the account's current data ---------- */
    onProgress?.("Removing current data…");
    const old = await db.select({ key: photos.storageKey }).from(photos).where(eq(photos.userId, userId));
    const store = storage();
    await db.transaction(async (tx) => {
      await tx.delete(journalEntries).where(eq(journalEntries.userId, userId));
      await tx.delete(albums).where(eq(albums.userId, userId));
      await tx.delete(photos).where(eq(photos.userId, userId));
      await tx.delete(tripStops).where(sql`${tripStops.tripId} in (select id from trips where user_id = ${userId})`);
      await tx.delete(trips).where(eq(trips.userId, userId));
      await tx.delete(places).where(eq(places.userId, userId));
      await tx.delete(cityLogs).where(eq(cityLogs.userId, userId));
      await tx.delete(stateLogs).where(eq(stateLogs.userId, userId));
    });
    await Promise.all(old.map((p) => store.deletePrefix(p.key).catch(() => {})));

    /* ---------- trips, places, logs ---------- */
    const tripMap = new Map<string, string>();
    for (const t of tripRows) tripMap.set(String(t.id), randomUUID());
    const photoMap = new Map<string, string>();

    if (tripRows.length)
      await db.insert(trips).values(
        tripRows.map((t) => ({
          id: tripMap.get(String(t.id))!,
          userId,
          name: str(t.name) ?? "Untitled trip",
          startDate: date(t.startDate),
          endDate: date(t.endDate),
          summary: str(t.summary),
          notes: str(t.notes),
          createdAt: ts(t.createdAt),
          updatedAt: ts(t.updatedAt),
        })),
      );
    const stops = stopRows.filter((s) => tripMap.has(String(s.tripId)) && city(s.cityId));
    if (stops.length)
      await db.insert(tripStops).values(
        stops.map((s) => ({
          tripId: tripMap.get(String(s.tripId))!,
          cityId: city(s.cityId)!,
          position: num(s.position) ?? 0,
          arriveOn: date(s.arriveOn),
          departOn: date(s.departOn),
          notes: str(s.notes),
        })),
      );
    const placeList = placeRows.filter((p) => city(p.cityId));
    if (placeList.length)
      await db.insert(places).values(
        placeList.map((p) => ({
          userId,
          cityId: city(p.cityId)!,
          name: str(p.name) ?? "Place",
          category: (CATEGORIES.has(String(p.category)) ? p.category : "other") as "other",
          address: str(p.address),
          notes: str(p.notes),
          url: str(p.url),
          lat: num(p.lat),
          lon: num(p.lon),
          favorite: p.favorite === true,
          createdAt: ts(p.createdAt),
        })),
      );

    /* ---------- photos (variants are regenerated from the originals) ---------- */
    let done = 0;
    let skipped = 0;
    for (const p of photoRows) {
      const entryName = photoFile.get(String(p.id));
      const entry = entryName ? entries.get(entryName) : undefined;
      if (!entry) {
        skipped++;
        continue;
      }
      try {
        const buf = await readEntry(zip, entry);
        const img = await processImage(buf);
        const id = randomUUID();
        const storageKey = `${userId}/${id}`;
        await store.put(variantKey(storageKey, "original", img.ext), buf, img.mimeType);
        await store.put(variantKey(storageKey, "display", img.ext), img.display, "image/webp");
        await store.put(variantKey(storageKey, "thumb", img.ext), img.thumb, "image/webp");
        await db.insert(photos).values({
          id,
          userId,
          cityId: city(p.cityId),
          tripId: p.tripId ? (tripMap.get(String(p.tripId)) ?? null) : null,
          storageKey,
          originalName: str(p.originalName),
          mimeType: img.mimeType,
          sizeBytes: buf.length,
          width: img.width,
          height: img.height,
          dominantColor: img.dominantColor,
          takenOn: date(p.takenOn) ?? img.takenOn,
          // a location saved in the backup (perhaps set by hand) wins over the camera's
          lat: num(p.lat) !== null && num(p.lon) !== null ? num(p.lat) : (img.gps?.lat ?? null),
          lon: num(p.lat) !== null && num(p.lon) !== null ? num(p.lon) : (img.gps?.lon ?? null),
          caption: str(p.caption),
          description: str(p.description),
          position: num(p.position) ?? 0,
          createdAt: ts(p.createdAt),
        });
        photoMap.set(String(p.id), id);
        if (++done % 10 === 0) onProgress?.(`Restoring photos… ${done}/${photoRows.length}`);
      } catch (err) {
        console.error(`backup photo ${String(p.id)} skipped`, err);
        skipped++;
      }
    }
    const photo = (id: unknown) => (id == null ? null : (photoMap.get(String(id)) ?? null));

    /* ---------- logs, covers, albums, journal ---------- */
    const logList = logs.filter((l) => city(l.cityId));
    const seenCities = new Set<number>();
    for (const l of logList) {
      const cid = city(l.cityId)!;
      if (seenCities.has(cid)) continue;
      seenCities.add(cid);
      const rating = num(l.rating);
      await db.insert(cityLogs).values({
        userId,
        cityId: cid,
        status: (STATUS.has(String(l.status)) ? l.status : "not_visited") as "visited",
        visitedOn: date(l.visitedOn),
        visitedUntil: date(l.visitedUntil),
        rating: rating && rating >= 1 && rating <= 5 ? rating : null,
        impression: str(l.impression),
        notes: str(l.notes),
        tags: strArr(l.tags),
        coverPhotoId: photo(l.coverPhotoId),
        createdAt: ts(l.createdAt),
        updatedAt: ts(l.updatedAt),
      });
    }
    for (const s of stateRows) {
      const code = String(s.stateCode ?? s.code ?? "");
      if (!STATE_BY_CODE.has(code)) continue;
      await db
        .insert(stateLogs)
        .values({ userId, stateCode: code, notes: str(s.notes), coverPhotoId: photo(s.coverPhotoId) })
        .onConflictDoNothing();
    }
    for (const t of tripRows) {
      const cover = photo(t.coverPhotoId);
      if (cover) await db.update(trips).set({ coverPhotoId: cover }).where(eq(trips.id, tripMap.get(String(t.id))!));
    }
    const albumMap = new Map<string, string>();
    for (const a of albumRows) {
      const id = randomUUID();
      albumMap.set(String(a.id), id);
      await db.insert(albums).values({
        id,
        userId,
        title: str(a.title) ?? "Album",
        description: str(a.description),
        tripId: a.tripId ? (tripMap.get(String(a.tripId)) ?? null) : null,
        coverPhotoId: photo(a.coverPhotoId),
        createdAt: ts(a.createdAt),
        updatedAt: ts(a.updatedAt),
      });
    }
    const aLinks = albumLinks.filter((l) => albumMap.has(String(l.albumId)) && photo(l.photoId));
    if (aLinks.length)
      await db
        .insert(albumPhotos)
        .values(aLinks.map((l) => ({ albumId: albumMap.get(String(l.albumId))!, photoId: photo(l.photoId)!, position: num(l.position) ?? 0 })))
        .onConflictDoNothing();
    const entryMap = new Map<string, string>();
    for (const e of entryRows) {
      const id = randomUUID();
      entryMap.set(String(e.id), id);
      await db.insert(journalEntries).values({
        id,
        userId,
        title: str(e.title) ?? "Untitled",
        entryDate: date(e.entryDate) ?? new Date().toISOString().slice(0, 10),
        cityId: city(e.cityId),
        tripId: e.tripId ? (tripMap.get(String(e.tripId)) ?? null) : null,
        body: typeof e.body === "string" ? e.body : "",
        highlights: str(e.highlights),
        placesVisited: strArr(e.placesVisited),
        tags: strArr(e.tags),
        createdAt: ts(e.createdAt),
        updatedAt: ts(e.updatedAt),
      });
    }
    const jLinks = entryLinks.filter((l) => entryMap.has(String(l.entryId)) && photo(l.photoId));
    if (jLinks.length)
      await db
        .insert(journalPhotos)
        .values(jLinks.map((l) => ({ entryId: entryMap.get(String(l.entryId))!, photoId: photo(l.photoId)!, position: num(l.position) ?? 0 })))
        .onConflictDoNothing();

    return {
      format,
      cities: seenCities.size,
      places: placeList.length,
      trips: tripRows.length,
      albums: albumRows.length,
      journalEntries: entryRows.length,
      photos: done,
      photosSkipped: skipped,
    };
  } finally {
    zip.close();
  }
}
