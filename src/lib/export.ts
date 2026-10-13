import "server-only";
import { eq, inArray } from "drizzle-orm";
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
  users,
} from "@/db/schema";

export const EXPORT_VERSION = 1;

/** Everything belonging to one user, as portable JSON (city records carry name/state/coordinates). */
export async function buildExport(userId: string) {
  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId));

  const [logs, customCities, placeRows, stateRows, tripRows, photoRows, albumRows, entryRows] = await Promise.all([
    db.select().from(cityLogs).where(eq(cityLogs.userId, userId)),
    db.select().from(cities).where(eq(cities.createdBy, userId)),
    db.select().from(places).where(eq(places.userId, userId)),
    db.select().from(stateLogs).where(eq(stateLogs.userId, userId)),
    db.select().from(trips).where(eq(trips.userId, userId)),
    db.select().from(photos).where(eq(photos.userId, userId)),
    db.select().from(albums).where(eq(albums.userId, userId)),
    db.select().from(journalEntries).where(eq(journalEntries.userId, userId)),
  ]);

  const tripIds = tripRows.map((t) => t.id);
  const albumIds = albumRows.map((a) => a.id);
  const entryIds = entryRows.map((e) => e.id);
  const [stops, albumLinks, entryLinks] = await Promise.all([
    tripIds.length ? db.select().from(tripStops).where(inArray(tripStops.tripId, tripIds)) : [],
    albumIds.length ? db.select().from(albumPhotos).where(inArray(albumPhotos.albumId, albumIds)) : [],
    entryIds.length ? db.select().from(journalPhotos).where(inArray(journalPhotos.entryId, entryIds)) : [],
  ]);

  const cityIds = [
    ...new Set([
      ...logs.map((l) => l.cityId),
      ...placeRows.map((p) => p.cityId),
      ...stops.map((s) => s.cityId),
      ...photoRows.flatMap((p) => (p.cityId ? [p.cityId] : [])),
      ...entryRows.flatMap((e) => (e.cityId ? [e.cityId] : [])),
    ]),
  ];
  const cityRefs = cityIds.length
    ? await db
        .select({ id: cities.id, geonameId: cities.geonameId, name: cities.name, stateCode: cities.stateCode, lat: cities.lat, lon: cities.lon })
        .from(cities)
        .where(inArray(cities.id, cityIds))
    : [];

  return {
    format: "us-travel-journal",
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    user,
    cities: cityRefs,
    customCities,
    cityLogs: logs,
    places: placeRows,
    stateLogs: stateRows,
    trips: tripRows,
    tripStops: stops,
    photos: photoRows.map((p) => ({ ...p, file: `photos/${p.id}/original` })),
    albums: albumRows,
    albumPhotos: albumLinks,
    journalEntries: entryRows,
    journalPhotos: entryLinks,
  };
}
