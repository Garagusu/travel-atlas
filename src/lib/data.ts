import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
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
  shareLinks,
  stateLogs,
  states,
  tripStops,
  trips,
  users,
  type VisitStatus,
} from "@/db/schema";
import { TOTAL_STATES } from "./geo/states-meta";

/* All functions here take the owner's user id and only ever return that user's
   records (plus shared geographic reference data). */

/* ------------------------------------------------------------------ */
/* Shared fragments                                                    */
/* ------------------------------------------------------------------ */

export const photoColumns = {
  id: photos.id,
  width: photos.width,
  height: photos.height,
  dominantColor: photos.dominantColor,
  caption: photos.caption,
  description: photos.description,
  takenOn: photos.takenOn,
  cityId: photos.cityId,
  tripId: photos.tripId,
  createdAt: photos.createdAt,
};
export type PhotoItem = {
  id: string;
  width: number;
  height: number;
  dominantColor: string | null;
  caption: string | null;
  description: string | null;
  takenOn: string | null;
  cityId: number | null;
  tripId: string | null;
  createdAt: Date;
  cityName?: string | null;
  stateCode?: string | null;
};

/**
 * Fully qualified outer-table columns for correlated subqueries. Drizzle leaves
 * columns unqualified in single-table queries, which would bind them to the
 * subquery's own table instead.
 */
const ref = {
  cityId: sql.raw(`"cities"."id"`),
  tripId: sql.raw(`"trips"."id"`),
  albumId: sql.raw(`"albums"."id"`),
  entryId: sql.raw(`"journal_entries"."id"`),
};

/** cities visible to this user: all seeded cities plus the ones they added */
const visibleCity = (userId: string) => or(isNull(cities.createdBy), eq(cities.createdBy, userId));

/* ------------------------------------------------------------------ */
/* Stats                                                               */
/* ------------------------------------------------------------------ */

export type TravelStats = {
  statesVisited: number;
  statesWanted: number;
  citiesVisited: number;
  citiesWanted: number;
  trips: number;
  photos: number;
  journalEntries: number;
  percentExplored: number;
  totalStates: number;
};

export async function getStats(userId: string): Promise<TravelStats> {
  const res = await db.execute<{
    states_visited: number;
    states_wanted: number;
    cities_visited: number;
    cities_wanted: number;
    trips: number;
    photos: number;
    journal: number;
  }>(sql`
    select
      (select count(distinct c.state_code)::int from city_logs l join cities c on c.id = l.city_id
         join states s on s.code = c.state_code
         where l.user_id = ${userId} and l.status = 'visited' and s.is_state) as states_visited,
      (select count(distinct c.state_code)::int from city_logs l join cities c on c.id = l.city_id
         join states s on s.code = c.state_code
         where l.user_id = ${userId} and l.status = 'want_to_visit' and s.is_state
           and c.state_code not in (select c2.state_code from city_logs l2 join cities c2 on c2.id = l2.city_id
                                    where l2.user_id = ${userId} and l2.status = 'visited')) as states_wanted,
      (select count(*)::int from city_logs where user_id = ${userId} and status = 'visited') as cities_visited,
      (select count(*)::int from city_logs where user_id = ${userId} and status = 'want_to_visit') as cities_wanted,
      (select count(*)::int from trips where user_id = ${userId}) as trips,
      (select count(*)::int from photos where user_id = ${userId}) as photos,
      (select count(*)::int from journal_entries where user_id = ${userId}) as journal
  `);
  const r = res.rows[0];
  return {
    statesVisited: r.states_visited,
    statesWanted: r.states_wanted,
    citiesVisited: r.cities_visited,
    citiesWanted: r.cities_wanted,
    trips: r.trips,
    photos: r.photos,
    journalEntries: r.journal,
    percentExplored: Math.round((r.states_visited / TOTAL_STATES) * 100),
    totalStates: TOTAL_STATES,
  };
}

/** Per-state status: visited if any city visited, wanted if any city on the wishlist. */
export async function getStateStatuses(userId: string) {
  const res = await db.execute<{ code: string; visited: number; wanted: number }>(sql`
    select c.state_code as code,
      count(*) filter (where l.status = 'visited')::int as visited,
      count(*) filter (where l.status = 'want_to_visit')::int as wanted
    from city_logs l join cities c on c.id = l.city_id
    where l.user_id = ${userId} and l.status <> 'not_visited'
    group by c.state_code
  `);
  return res.rows;
}

/* ------------------------------------------------------------------ */
/* Map                                                                 */
/* ------------------------------------------------------------------ */

const STATUS_CODE: Record<VisitStatus, number> = { not_visited: 0, want_to_visit: 1, visited: 2 };

/** The user's own city records (plus any custom cities they added), for the map overlay. */
export async function getMapStatuses(userId: string) {
  const rows = await db
    .select({
      id: cities.id,
      name: cities.name,
      state: cities.stateCode,
      lon: cities.lon,
      lat: cities.lat,
      pop: cities.population,
      status: cityLogs.status,
      custom: sql<boolean>`${cities.createdBy} is not null`,
    })
    .from(cities)
    .leftJoin(cityLogs, and(eq(cityLogs.cityId, cities.id), eq(cityLogs.userId, userId)))
    .where(or(eq(cities.createdBy, userId), and(eq(cityLogs.userId, userId))));
  return rows.map((r) => ({ ...r, s: STATUS_CODE[r.status ?? "not_visited"] }));
}

export async function getAllSeededCitiesCompact() {
  const rows = await db
    .select({ id: cities.id, name: cities.name, state: cities.stateCode, lon: cities.lon, lat: cities.lat, pop: cities.population })
    .from(cities)
    .where(isNull(cities.createdBy))
    .orderBy(desc(cities.population));
  return rows;
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

export async function searchPlaces(userId: string, q: string, limit = 12) {
  const term = q.trim();
  if (!term) return { states: [], cities: [] };
  const like = `${term.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  const contains = `%${term.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  const [stateRows, cityRows] = await Promise.all([
    db
      .select({ code: states.code, name: states.name, bbox: states.bbox })
      .from(states)
      .where(or(ilike(states.name, like), eq(states.code, term.toUpperCase())))
      .limit(5),
    db
      .select({
        id: cities.id,
        name: cities.name,
        state: cities.stateCode,
        lat: cities.lat,
        lon: cities.lon,
        population: cities.population,
        status: cityLogs.status,
      })
      .from(cities)
      .leftJoin(cityLogs, and(eq(cityLogs.cityId, cities.id), eq(cityLogs.userId, userId)))
      .where(and(visibleCity(userId), ilike(cities.name, contains)))
      .orderBy(
        sql`case when lower(${cities.name}) = lower(${term}) then 0 when ${cities.name} ilike ${like} then 1 else 2 end`,
        desc(cities.population),
      )
      .limit(limit),
  ]);
  return { states: stateRows, cities: cityRows.map((c) => ({ ...c, status: c.status ?? "not_visited" })) };
}

/* ------------------------------------------------------------------ */
/* Covers                                                              */
/* ------------------------------------------------------------------ */

/** cover photo for a city: chosen cover, else first photo in gallery order */
const cityCoverSql = (userId: string) => sql<string | null>`coalesce(${cityLogs.coverPhotoId},
  (select p.id from photos p where p.user_id = ${userId} and p.city_id = ${ref.cityId}
   order by p.position, p.created_at limit 1))`;

/* ------------------------------------------------------------------ */
/* Cities                                                              */
/* ------------------------------------------------------------------ */

export async function getCity(userId: string, cityId: number) {
  const [row] = await db
    .select({
      city: cities,
      stateName: states.name,
      log: cityLogs,
      cover: cityCoverSql(userId),
    })
    .from(cities)
    .innerJoin(states, eq(states.code, cities.stateCode))
    .leftJoin(cityLogs, and(eq(cityLogs.cityId, cities.id), eq(cityLogs.userId, userId)))
    .where(and(eq(cities.id, cityId), visibleCity(userId)))
    .limit(1);
  return row ?? null;
}

export async function getCityPhotos(userId: string, cityId: number) {
  return db
    .select(photoColumns)
    .from(photos)
    .where(and(eq(photos.userId, userId), eq(photos.cityId, cityId)))
    .orderBy(asc(photos.position), asc(photos.createdAt));
}

export async function getCityPlaces(userId: string, cityId: number) {
  return db
    .select()
    .from(places)
    .where(and(eq(places.userId, userId), eq(places.cityId, cityId)))
    .orderBy(desc(places.favorite), asc(places.category), asc(places.name));
}

export async function getTripsForCity(userId: string, cityId: number) {
  return db
    .selectDistinct({ id: trips.id, name: trips.name, startDate: trips.startDate, endDate: trips.endDate })
    .from(trips)
    .innerJoin(tripStops, eq(tripStops.tripId, trips.id))
    .where(and(eq(trips.userId, userId), eq(tripStops.cityId, cityId)))
    .orderBy(desc(trips.startDate));
}

export async function getJournalForCity(userId: string, cityId: number) {
  return db
    .select({ id: journalEntries.id, title: journalEntries.title, entryDate: journalEntries.entryDate, body: journalEntries.body })
    .from(journalEntries)
    .where(and(eq(journalEntries.userId, userId), eq(journalEntries.cityId, cityId)))
    .orderBy(desc(journalEntries.entryDate));
}

export type CityListFilter = {
  status?: VisitStatus | "all";
  state?: string;
  tag?: string;
  q?: string;
};

/** Cities the user has a record for (any status). */
export async function listMyCities(userId: string, f: CityListFilter = {}) {
  const where: SQL[] = [eq(cityLogs.userId, userId)];
  if (f.status && f.status !== "all") where.push(eq(cityLogs.status, f.status));
  if (f.state) where.push(eq(cities.stateCode, f.state.toUpperCase()));
  if (f.tag) where.push(sql`${f.tag} = any(${cityLogs.tags})`);
  if (f.q) where.push(ilike(cities.name, `%${f.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`));
  return db
    .select({
      id: cities.id,
      name: cities.name,
      stateCode: cities.stateCode,
      stateName: states.name,
      lat: cities.lat,
      lon: cities.lon,
      status: cityLogs.status,
      visitedOn: cityLogs.visitedOn,
      rating: cityLogs.rating,
      impression: cityLogs.impression,
      tags: cityLogs.tags,
      updatedAt: cityLogs.updatedAt,
      cover: cityCoverSql(userId),
      photoCount: sql<number>`(select count(*)::int from photos p where p.user_id = ${userId} and p.city_id = ${ref.cityId})`,
    })
    .from(cityLogs)
    .innerJoin(cities, eq(cities.id, cityLogs.cityId))
    .innerJoin(states, eq(states.code, cities.stateCode))
    .where(and(...where))
    .orderBy(
      sql`case ${cityLogs.status} when 'visited' then 0 when 'want_to_visit' then 1 else 2 end`,
      sql`${cityLogs.visitedOn} desc nulls last`,
      desc(cityLogs.updatedAt),
    );
}

export async function recentVisitedCities(userId: string, limit = 6) {
  return db
    .select({
      id: cities.id,
      name: cities.name,
      stateCode: cities.stateCode,
      visitedOn: cityLogs.visitedOn,
      cover: cityCoverSql(userId),
    })
    .from(cityLogs)
    .innerJoin(cities, eq(cities.id, cityLogs.cityId))
    .where(and(eq(cityLogs.userId, userId), eq(cityLogs.status, "visited")))
    .orderBy(sql`${cityLogs.visitedOn} desc nulls last`, desc(cityLogs.updatedAt))
    .limit(limit);
}

export async function wishlist(userId: string, limit?: number) {
  const q = db
    .select({
      id: cities.id,
      name: cities.name,
      stateCode: cities.stateCode,
      stateName: states.name,
      notes: cityLogs.notes,
      tags: cityLogs.tags,
      updatedAt: cityLogs.updatedAt,
      population: cities.population,
      cover: cityCoverSql(userId),
      placeCount: sql<number>`(select count(*)::int from places pl where pl.user_id = ${userId} and pl.city_id = ${ref.cityId})`,
    })
    .from(cityLogs)
    .innerJoin(cities, eq(cities.id, cityLogs.cityId))
    .innerJoin(states, eq(states.code, cities.stateCode))
    .where(and(eq(cityLogs.userId, userId), eq(cityLogs.status, "want_to_visit")))
    .orderBy(desc(cityLogs.updatedAt));
  return limit ? q.limit(limit) : q;
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

export async function getStateDetail(userId: string, code: string) {
  const [state] = await db.select().from(states).where(eq(states.code, code)).limit(1);
  if (!state) return null;

  const [log] = await db
    .select()
    .from(stateLogs)
    .where(and(eq(stateLogs.userId, userId), eq(stateLogs.stateCode, code)))
    .limit(1);

  const myCities = await listMyCities(userId, { state: code });

  const topCities = await db
    .select({ id: cities.id, name: cities.name, population: cities.population })
    .from(cities)
    .where(and(eq(cities.stateCode, code), visibleCity(userId)))
    .orderBy(desc(cities.population))
    .limit(24);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(cities)
    .where(and(eq(cities.stateCode, code), visibleCity(userId)));

  const statePhotos = await db
    .select({ ...photoColumns, cityName: cities.name })
    .from(photos)
    .innerJoin(cities, eq(cities.id, photos.cityId))
    .where(and(eq(photos.userId, userId), eq(cities.stateCode, code)))
    .orderBy(desc(photos.createdAt))
    .limit(60);

  const [{ photoCount }] = await db
    .select({ photoCount: sql<number>`count(*)::int` })
    .from(photos)
    .innerJoin(cities, eq(cities.id, photos.cityId))
    .where(and(eq(photos.userId, userId), eq(cities.stateCode, code)));

  const entries = await db
    .select({
      id: journalEntries.id,
      title: journalEntries.title,
      entryDate: journalEntries.entryDate,
      cityName: cities.name,
      body: journalEntries.body,
    })
    .from(journalEntries)
    .innerJoin(cities, eq(cities.id, journalEntries.cityId))
    .where(and(eq(journalEntries.userId, userId), eq(cities.stateCode, code)))
    .orderBy(desc(journalEntries.entryDate))
    .limit(10);

  const stateTrips = await db
    .selectDistinct({ id: trips.id, name: trips.name, startDate: trips.startDate, endDate: trips.endDate })
    .from(trips)
    .innerJoin(tripStops, eq(tripStops.tripId, trips.id))
    .innerJoin(cities, eq(cities.id, tripStops.cityId))
    .where(and(eq(trips.userId, userId), eq(cities.stateCode, code)))
    .orderBy(desc(trips.startDate));

  const coverId = log?.coverPhotoId ?? statePhotos[0]?.id ?? null;

  return { state, log: log ?? null, myCities, topCities, totalCities: total, photos: statePhotos, photoCount, entries, trips: stateTrips, coverId };
}

/* ------------------------------------------------------------------ */
/* Trips                                                               */
/* ------------------------------------------------------------------ */

const tripCoverSql = (userId: string) => sql<string | null>`coalesce(${trips.coverPhotoId},
  (select p.id from photos p where p.user_id = ${userId} and p.trip_id = ${ref.tripId} order by p.position, p.created_at limit 1))`;

export async function listTrips(userId: string) {
  return db
    .select({
      id: trips.id,
      name: trips.name,
      startDate: trips.startDate,
      endDate: trips.endDate,
      summary: trips.summary,
      cover: tripCoverSql(userId),
      stopCount: sql<number>`(select count(*)::int from trip_stops ts where ts.trip_id = ${ref.tripId})`,
      photoCount: sql<number>`(select count(*)::int from photos p where p.trip_id = ${ref.tripId})`,
      stateCodes: sql<string[]>`coalesce((select array_agg(distinct c.state_code) from trip_stops ts join cities c on c.id = ts.city_id where ts.trip_id = ${ref.tripId}), '{}')`,
    })
    .from(trips)
    .where(eq(trips.userId, userId))
    .orderBy(sql`${trips.startDate} desc nulls first`, desc(trips.createdAt));
}

export async function getTrip(userId: string, tripId: string) {
  const [trip] = await db
    .select({ trip: trips, cover: tripCoverSql(userId) })
    .from(trips)
    .where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
    .limit(1);
  if (!trip) return null;
  const stops = await db
    .select({
      id: tripStops.id,
      position: tripStops.position,
      arriveOn: tripStops.arriveOn,
      departOn: tripStops.departOn,
      notes: tripStops.notes,
      cityId: cities.id,
      cityName: cities.name,
      stateCode: cities.stateCode,
      lat: cities.lat,
      lon: cities.lon,
      status: cityLogs.status,
    })
    .from(tripStops)
    .innerJoin(cities, eq(cities.id, tripStops.cityId))
    .leftJoin(cityLogs, and(eq(cityLogs.cityId, cities.id), eq(cityLogs.userId, userId)))
    .where(eq(tripStops.tripId, tripId))
    .orderBy(asc(tripStops.position));
  const tripPhotos = await db
    .select({ ...photoColumns, cityName: cities.name, stateCode: cities.stateCode })
    .from(photos)
    .leftJoin(cities, eq(cities.id, photos.cityId))
    .where(and(eq(photos.userId, userId), eq(photos.tripId, tripId)))
    .orderBy(asc(photos.takenOn), asc(photos.position), asc(photos.createdAt));
  const entries = await db
    .select({
      id: journalEntries.id,
      title: journalEntries.title,
      entryDate: journalEntries.entryDate,
      body: journalEntries.body,
      cityName: cities.name,
      stateCode: cities.stateCode,
    })
    .from(journalEntries)
    .leftJoin(cities, eq(cities.id, journalEntries.cityId))
    .where(and(eq(journalEntries.userId, userId), eq(journalEntries.tripId, tripId)))
    .orderBy(asc(journalEntries.entryDate));
  const tripAlbums = await db
    .select({ id: albums.id, title: albums.title })
    .from(albums)
    .where(and(eq(albums.userId, userId), eq(albums.tripId, tripId)));
  return { ...trip.trip, cover: trip.cover, stops, photos: tripPhotos, entries, albums: tripAlbums };
}

export async function listTripOptions(userId: string) {
  return db
    .select({ id: trips.id, name: trips.name, startDate: trips.startDate })
    .from(trips)
    .where(eq(trips.userId, userId))
    .orderBy(sql`${trips.startDate} desc nulls first`);
}

/* ------------------------------------------------------------------ */
/* Albums & photos                                                     */
/* ------------------------------------------------------------------ */

export async function listAlbums(userId: string) {
  return db
    .select({
      id: albums.id,
      title: albums.title,
      description: albums.description,
      tripId: albums.tripId,
      cover: sql<string | null>`coalesce(${albums.coverPhotoId},
        (select ap.photo_id from album_photos ap where ap.album_id = ${ref.albumId} order by ap.position, ap.added_at limit 1))`,
      photoCount: sql<number>`(select count(*)::int from album_photos ap where ap.album_id = ${ref.albumId})`,
      updatedAt: albums.updatedAt,
    })
    .from(albums)
    .where(eq(albums.userId, userId))
    .orderBy(desc(albums.updatedAt));
}

export async function getAlbum(userId: string, albumId: string) {
  const [album] = await db
    .select({
      album: albums,
      tripName: trips.name,
    })
    .from(albums)
    .leftJoin(trips, eq(trips.id, albums.tripId))
    .where(and(eq(albums.id, albumId), eq(albums.userId, userId)))
    .limit(1);
  if (!album) return null;
  const items = await db
    .select({ ...photoColumns, cityName: cities.name, stateCode: cities.stateCode })
    .from(albumPhotos)
    .innerJoin(photos, eq(photos.id, albumPhotos.photoId))
    .leftJoin(cities, eq(cities.id, photos.cityId))
    .where(eq(albumPhotos.albumId, albumId))
    .orderBy(asc(albumPhotos.position), asc(albumPhotos.addedAt));
  return { ...album.album, tripName: album.tripName, photos: items, coverId: album.album.coverPhotoId ?? items[0]?.id ?? null };
}

/** Year a photo belongs to: the day it was taken, or the upload day (UTC) when the camera date is missing. */
const photoYearSql = sql<number>`coalesce(extract(year from ${photos.takenOn}), extract(year from ${photos.createdAt} at time zone 'UTC'))::int`;

export async function listPhotosPage(userId: string, opts: { before?: string; limit?: number; year?: number | null; cityId?: number | null } = {}) {
  const limit = Math.min(opts.limit ?? 60, 200);
  const where: SQL[] = [eq(photos.userId, userId)];
  if (opts.before) where.push(sql`${photos.createdAt} < ${new Date(opts.before)}`);
  if (opts.year) where.push(sql`${photoYearSql} = ${opts.year}`);
  if (opts.cityId) where.push(eq(photos.cityId, opts.cityId));
  const rows = await db
    .select({ ...photoColumns, cityName: cities.name, stateCode: cities.stateCode })
    .from(photos)
    .leftJoin(cities, eq(cities.id, photos.cityId))
    .where(and(...where))
    .orderBy(desc(photos.createdAt))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  return { items, nextCursor: hasMore ? items[items.length - 1].createdAt.toISOString() : null };
}

/** Year and city choices for the photo library filter, with photo counts. */
export async function photoFilterFacets(userId: string) {
  return db
    .select({ year: photoYearSql, cityId: photos.cityId, cityName: cities.name, stateCode: cities.stateCode, count: sql<number>`count(*)::int` })
    .from(photos)
    .leftJoin(cities, eq(cities.id, photos.cityId))
    .where(eq(photos.userId, userId))
    .groupBy(photoYearSql, photos.cityId, cities.name, cities.stateCode);
}
export type PhotoFacet = Awaited<ReturnType<typeof photoFilterFacets>>[number];

export async function getPhoto(userId: string, photoId: string) {
  const [row] = await db
    .select()
    .from(photos)
    .where(and(eq(photos.id, photoId), eq(photos.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function albumsForPhotos(userId: string, photoIds: string[]) {
  if (!photoIds.length) return [];
  return db
    .select({ photoId: albumPhotos.photoId, albumId: albums.id, title: albums.title })
    .from(albumPhotos)
    .innerJoin(albums, eq(albums.id, albumPhotos.albumId))
    .where(and(eq(albums.userId, userId), inArray(albumPhotos.photoId, photoIds)));
}

/* ------------------------------------------------------------------ */
/* Journal                                                             */
/* ------------------------------------------------------------------ */

export async function listJournal(userId: string, f: { q?: string; tag?: string; tripId?: string } = {}) {
  const where: SQL[] = [eq(journalEntries.userId, userId)];
  if (f.q) {
    const t = `%${f.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    where.push(
      or(
        ilike(journalEntries.title, t),
        ilike(journalEntries.body, t),
        ilike(journalEntries.highlights, t),
        ilike(cities.name, t),
        sql`exists (select 1 from unnest(${journalEntries.tags}) tg where tg ilike ${t})`,
        sql`exists (select 1 from unnest(${journalEntries.placesVisited}) pv where pv ilike ${t})`,
      )!,
    );
  }
  if (f.tag) where.push(sql`${f.tag} = any(${journalEntries.tags})`);
  if (f.tripId) where.push(eq(journalEntries.tripId, f.tripId));
  return db
    .select({
      id: journalEntries.id,
      title: journalEntries.title,
      entryDate: journalEntries.entryDate,
      body: journalEntries.body,
      tags: journalEntries.tags,
      cityId: cities.id,
      cityName: cities.name,
      stateCode: cities.stateCode,
      tripId: trips.id,
      tripName: trips.name,
      cover: sql<string | null>`(select jp.photo_id from journal_photos jp where jp.entry_id = ${ref.entryId} order by jp.position limit 1)`,
      photoCount: sql<number>`(select count(*)::int from journal_photos jp where jp.entry_id = ${ref.entryId})`,
    })
    .from(journalEntries)
    .leftJoin(cities, eq(cities.id, journalEntries.cityId))
    .leftJoin(trips, eq(trips.id, journalEntries.tripId))
    .where(and(...where))
    .orderBy(desc(journalEntries.entryDate), desc(journalEntries.createdAt));
}

export async function getJournalEntry(userId: string, id: string) {
  const [row] = await db
    .select({
      entry: journalEntries,
      cityName: cities.name,
      stateCode: cities.stateCode,
      tripName: trips.name,
    })
    .from(journalEntries)
    .leftJoin(cities, eq(cities.id, journalEntries.cityId))
    .leftJoin(trips, eq(trips.id, journalEntries.tripId))
    .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, userId)))
    .limit(1);
  if (!row) return null;
  const items = await db
    .select({ ...photoColumns, cityName: cities.name, stateCode: cities.stateCode })
    .from(journalPhotos)
    .innerJoin(photos, eq(photos.id, journalPhotos.photoId))
    .leftJoin(cities, eq(cities.id, photos.cityId))
    .where(eq(journalPhotos.entryId, id))
    .orderBy(asc(journalPhotos.position));
  return { ...row.entry, cityName: row.cityName, stateCode: row.stateCode, tripName: row.tripName, photos: items };
}

export async function journalTags(userId: string) {
  const res = await db.execute<{ tag: string; n: number }>(sql`
    select tag, count(*)::int as n from journal_entries, unnest(tags) as tag
    where user_id = ${userId} group by tag order by n desc, tag limit 40`);
  return res.rows;
}

export async function recentPhotos(userId: string, limit = 12) {
  return db
    .select({ ...photoColumns, cityName: cities.name, stateCode: cities.stateCode })
    .from(photos)
    .leftJoin(cities, eq(cities.id, photos.cityId))
    .where(eq(photos.userId, userId))
    .orderBy(desc(photos.createdAt))
    .limit(limit);
}

export async function cityLabel(cityId: number) {
  const [c] = await db
    .select({ id: cities.id, name: cities.name, stateCode: cities.stateCode })
    .from(cities)
    .where(eq(cities.id, cityId))
    .limit(1);
  return c ?? null;
}

export async function nearbyCities(lat: number, lon: number, excludeId: number, radiusDeg = 0.7, limit = 14) {
  return db
    .select({ id: cities.id, name: cities.name, lat: cities.lat, lon: cities.lon })
    .from(cities)
    .where(
      and(
        isNull(cities.createdBy),
        sql`${cities.id} <> ${excludeId}`,
        sql`${cities.lat} between ${lat - radiusDeg} and ${lat + radiusDeg}`,
        sql`${cities.lon} between ${lon - radiusDeg * 1.3} and ${lon + radiusDeg * 1.3}`,
      ),
    )
    .orderBy(desc(cities.population))
    .limit(limit);
}

/** Every saved place with its city, for the Places page and the main map. */
export async function listAllPlaces(userId: string, f: { category?: string; state?: string; q?: string } = {}) {
  const where: SQL[] = [eq(places.userId, userId)];
  if (f.category) where.push(sql`${places.category}::text = ${f.category}`);
  if (f.state) where.push(eq(cities.stateCode, f.state.toUpperCase()));
  if (f.q) {
    const t = `%${f.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    where.push(or(ilike(places.name, t), ilike(places.notes, t), ilike(places.address, t), ilike(cities.name, t))!);
  }
  return db
    .select({
      id: places.id,
      name: places.name,
      category: places.category,
      address: places.address,
      notes: places.notes,
      url: places.url,
      lat: places.lat,
      lon: places.lon,
      favorite: places.favorite,
      createdAt: places.createdAt,
      cityId: cities.id,
      cityName: cities.name,
      stateCode: cities.stateCode,
      cityLat: cities.lat,
      cityLon: cities.lon,
    })
    .from(places)
    .innerJoin(cities, eq(cities.id, places.cityId))
    .where(and(...where))
    .orderBy(asc(cities.stateCode), asc(cities.name), desc(places.favorite), asc(places.name));
}

/* ------------------------------------------------------------------ */
/* Share links                                                         */
/* ------------------------------------------------------------------ */

export async function listShareLinks(userId: string) {
  return db
    .select({ id: shareLinks.id, cityId: shareLinks.cityId, cityName: cities.name, stateCode: cities.stateCode, createdAt: shareLinks.createdAt })
    .from(shareLinks)
    .leftJoin(cities, eq(cities.id, shareLinks.cityId))
    .where(and(eq(shareLinks.userId, userId), isNull(shareLinks.revokedAt)))
    .orderBy(desc(shareLinks.createdAt));
}

/** Everything a public share page shows. Only places, notes and one cover photo — nothing else. */
export async function getSharedList(token: string) {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(token)) return null;
  const [link] = await db
    .select({ link: shareLinks, ownerName: users.name })
    .from(shareLinks)
    .innerJoin(users, eq(users.id, shareLinks.userId))
    .where(eq(shareLinks.id, token))
    .limit(1);
  if (!link || link.link.revokedAt) return null;
  const { userId, cityId } = link.link;
  const list = await listAllPlaces(userId);
  const chosen = cityId ? list.filter((p) => p.cityId === cityId) : list;
  let city = null;
  let coverId: string | null = null;
  if (cityId) {
    const c = await getCity(userId, cityId);
    if (c) {
      city = { id: c.city.id, name: c.city.name, stateCode: c.city.stateCode, stateName: c.stateName, lat: c.city.lat, lon: c.city.lon, impression: c.log?.impression ?? null, rating: c.log?.rating ?? null };
      coverId = c.cover;
    }
  }
  return {
    token,
    ownerFirstName: link.ownerName.split(" ")[0],
    city,
    coverId,
    places: chosen.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      address: p.address,
      notes: p.notes,
      url: p.url,
      lat: p.lat,
      lon: p.lon,
      favorite: p.favorite,
      cityId: p.cityId,
      cityName: p.cityName,
      stateCode: p.stateCode,
    })),
  };
}

/**
 * The closest city to a point (within maxKm), for filing photos by their GPS
 * location. Includes the user's own custom cities.
 */
export async function nearestCity(userId: string, lat: number, lon: number, maxKm = 25) {
  const dLat = maxKm / 111;
  const dLon = maxKm / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const rows = await db
    .select({ id: cities.id, name: cities.name, stateCode: cities.stateCode, lat: cities.lat, lon: cities.lon, population: cities.population })
    .from(cities)
    .where(
      and(
        or(isNull(cities.createdBy), eq(cities.createdBy, userId)),
        sql`${cities.lat} between ${lat - dLat} and ${lat + dLat}`,
        sql`${cities.lon} between ${lon - dLon} and ${lon + dLon}`,
      ),
    )
    .limit(500);
  let best: (typeof rows)[number] | null = null;
  let bestKm = Infinity;
  for (const c of rows) {
    const km = haversineKm(lat, lon, c.lat, c.lon);
    if (km < bestKm) [best, bestKm] = [c, km];
  }
  return best && bestKm <= maxKm ? { id: best.id, name: best.name, stateCode: best.stateCode } : null;
}

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const r = Math.PI / 180;
  const h = Math.sin(((bLat - aLat) * r) / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLon - aLon) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
