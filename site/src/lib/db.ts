import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Album, AlbumPhoto, CityLog, CityRef, JournalEntry, JournalPhoto, Photo, Place, StateLog, Trip, TripStop } from "./types";

/**
 * Everything is stored in the browser's IndexedDB, on this device only.
 * Record stores hold JSON objects; `blobs` holds the image files.
 */
interface AtlasDB extends DBSchema {
  cityLogs: { key: number; value: CityLog };
  stateLogs: { key: string; value: StateLog };
  customCities: { key: number; value: CityRef };
  places: { key: string; value: Place };
  trips: { key: string; value: Trip };
  tripStops: { key: string; value: TripStop };
  photos: { key: string; value: Photo };
  albums: { key: string; value: Album };
  albumPhotos: { key: [string, string]; value: AlbumPhoto };
  journal: { key: string; value: JournalEntry };
  journalPhotos: { key: [string, string]; value: JournalPhoto };
  blobs: { key: string; value: Blob };
}

export type StoreName =
  | "cityLogs"
  | "stateLogs"
  | "customCities"
  | "places"
  | "trips"
  | "tripStops"
  | "photos"
  | "albums"
  | "albumPhotos"
  | "journal"
  | "journalPhotos";
export const RECORD_STORES: StoreName[] = [
  "cityLogs",
  "stateLogs",
  "customCities",
  "places",
  "trips",
  "tripStops",
  "photos",
  "albums",
  "albumPhotos",
  "journal",
  "journalPhotos",
];

let dbPromise: Promise<IDBPDatabase<AtlasDB>> | null = null;

export function db() {
  dbPromise ??= openDB<AtlasDB>("travel-atlas", 1, {
    upgrade(d) {
      d.createObjectStore("cityLogs", { keyPath: "cityId" });
      d.createObjectStore("stateLogs", { keyPath: "code" });
      d.createObjectStore("customCities", { keyPath: "id" });
      d.createObjectStore("places", { keyPath: "id" });
      d.createObjectStore("trips", { keyPath: "id" });
      d.createObjectStore("tripStops", { keyPath: "id" });
      d.createObjectStore("photos", { keyPath: "id" });
      d.createObjectStore("albums", { keyPath: "id" });
      d.createObjectStore("albumPhotos", { keyPath: ["albumId", "photoId"] });
      d.createObjectStore("journal", { keyPath: "id" });
      d.createObjectStore("journalPhotos", { keyPath: ["entryId", "photoId"] });
      d.createObjectStore("blobs");
    },
  });
  return dbPromise;
}

export const blobKey = (photoId: string, variant: string) => `${photoId}/${variant}`;
