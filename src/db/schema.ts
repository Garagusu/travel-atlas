import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  char,
  date,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Accounts                                                            */
/* ------------------------------------------------------------------ */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    /** sha256 of the session token; the raw token only lives in the cookie */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------------ */
/* Geographic reference data (seeded, shared by all users)             */
/* ------------------------------------------------------------------ */

export const states = pgTable("states", {
  code: char("code", { length: 2 }).primaryKey(),
  name: text("name").notNull(),
  fips: char("fips", { length: 2 }).notNull().unique(),
  /** false for DC — shown on the map but not counted in "x of 50" */
  isState: boolean("is_state").notNull().default(true),
  /** [west, south, east, north] */
  bbox: doublePrecision("bbox").array().notNull(),
});

export const cities = pgTable(
  "cities",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    /** GeoNames id for seeded cities; null for cities a user adds */
    geonameId: integer("geoname_id").unique(),
    name: text("name").notNull(),
    stateCode: char("state_code", { length: 2 })
      .notNull()
      .references(() => states.code),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    population: integer("population").notNull().default(0),
    /** set when a user adds a place that isn't in the GeoNames dataset */
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("cities_state_idx").on(t.stateCode),
    index("cities_name_lower_idx").on(sql`lower(${t.name})`),
    index("cities_population_idx").on(t.population),
  ],
);

/* ------------------------------------------------------------------ */
/* Personal travel records                                             */
/* ------------------------------------------------------------------ */

export const visitStatus = pgEnum("visit_status", ["not_visited", "want_to_visit", "visited"]);

/** One row per (user, city) the user has touched — status, notes, rating, tags. */
export const cityLogs = pgTable(
  "city_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cityId: integer("city_id")
      .notNull()
      .references(() => cities.id, { onDelete: "cascade" }),
    status: visitStatus("status").notNull().default("not_visited"),
    visitedOn: date("visited_on"),
    visitedUntil: date("visited_until"),
    rating: smallint("rating"),
    impression: text("impression"),
    notes: text("notes"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    coverPhotoId: uuid("cover_photo_id").references((): AnyPgColumn => photos.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("city_logs_user_city_uq").on(t.userId, t.cityId),
    index("city_logs_user_status_idx").on(t.userId, t.status),
  ],
);

/** Per-user notes and cover photo for a state. */
export const stateLogs = pgTable(
  "state_logs",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stateCode: char("state_code", { length: 2 })
      .notNull()
      .references(() => states.code),
    notes: text("notes"),
    coverPhotoId: uuid("cover_photo_id").references((): AnyPgColumn => photos.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.stateCode] })],
);

export const placeCategory = pgEnum("place_category", [
  "restaurant",
  "museum",
  "attraction",
  "activity",
  "cafe",
  "bar",
  "hotel",
  "park",
  "shop",
  "other",
]);

/** Saved locations / favourite places inside a city. */
export const places = pgTable(
  "places",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cityId: integer("city_id")
      .notNull()
      .references(() => cities.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: placeCategory("category").notNull().default("attraction"),
    address: text("address"),
    notes: text("notes"),
    url: text("url"),
    lat: doublePrecision("lat"),
    lon: doublePrecision("lon"),
    favorite: boolean("favorite").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("places_user_city_idx").on(t.userId, t.cityId)],
);

export const trips = pgTable(
  "trips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startDate: date("start_date"),
    endDate: date("end_date"),
    summary: text("summary"),
    notes: text("notes"),
    coverPhotoId: uuid("cover_photo_id").references((): AnyPgColumn => photos.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("trips_user_idx").on(t.userId, t.startDate)],
);

/** Ordered itinerary. References the shared city record — never copies it. */
export const tripStops = pgTable(
  "trip_stops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    cityId: integer("city_id")
      .notNull()
      .references(() => cities.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    arriveOn: date("arrive_on"),
    departOn: date("depart_on"),
    notes: text("notes"),
  },
  (t) => [index("trip_stops_trip_idx").on(t.tripId, t.position)],
);

/* ------------------------------------------------------------------ */
/* Photos & albums                                                     */
/* ------------------------------------------------------------------ */

export const photos = pgTable(
  "photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cityId: integer("city_id").references(() => cities.id, { onDelete: "set null" }),
    tripId: uuid("trip_id").references(() => trips.id, { onDelete: "set null" }),
    /** storage key prefix; variants live at `${key}/original|display|thumb` */
    storageKey: text("storage_key").notNull().unique(),
    originalName: text("original_name"),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    /** average colour, used as a placeholder while thumbnails load */
    dominantColor: text("dominant_color"),
    takenOn: date("taken_on"),
    caption: text("caption"),
    description: text("description"),
    /** order within the city gallery */
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("photos_user_created_idx").on(t.userId, t.createdAt),
    index("photos_city_idx").on(t.userId, t.cityId, t.position),
    index("photos_trip_idx").on(t.tripId),
  ],
);

export const albums = pgTable(
  "albums",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    tripId: uuid("trip_id").references(() => trips.id, { onDelete: "set null" }),
    coverPhotoId: uuid("cover_photo_id").references(() => photos.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("albums_user_idx").on(t.userId)],
);

/** A photo can live in several albums without being duplicated. */
export const albumPhotos = pgTable(
  "album_photos",
  {
    albumId: uuid("album_id")
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    photoId: uuid("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.albumId, t.photoId] }), index("album_photos_photo_idx").on(t.photoId)],
);

/* ------------------------------------------------------------------ */
/* Journal                                                             */
/* ------------------------------------------------------------------ */

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    entryDate: date("entry_date").notNull(),
    cityId: integer("city_id").references(() => cities.id, { onDelete: "set null" }),
    tripId: uuid("trip_id").references(() => trips.id, { onDelete: "set null" }),
    body: text("body").notNull().default(""),
    highlights: text("highlights"),
    placesVisited: text("places_visited").array().notNull().default(sql`'{}'::text[]`),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("journal_user_date_idx").on(t.userId, t.entryDate),
    index("journal_city_idx").on(t.cityId),
    index("journal_trip_idx").on(t.tripId),
  ],
);

export const journalPhotos = pgTable(
  "journal_photos",
  {
    entryId: uuid("entry_id")
      .notNull()
      .references(() => journalEntries.id, { onDelete: "cascade" }),
    photoId: uuid("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.photoId] })],
);

export type User = typeof users.$inferSelect;
export type City = typeof cities.$inferSelect;
export type CityLog = typeof cityLogs.$inferSelect;
export type Photo = typeof photos.$inferSelect;
export type Trip = typeof trips.$inferSelect;
export type Album = typeof albums.$inferSelect;
export type JournalEntry = typeof journalEntries.$inferSelect;
export type Place = typeof places.$inferSelect;
export type VisitStatus = (typeof visitStatus.enumValues)[number];

/** Public, revocable links to a read-only list of recommendations. */
export const shareLinks = pgTable(
  "share_links",
  {
    /** random URL token */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** null = all saved places */
    cityId: integer("city_id").references(() => cities.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("share_links_user_idx").on(t.userId)],
);
export type ShareLink = typeof shareLinks.$inferSelect;
