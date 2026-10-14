import { z } from "zod";
import { fail, ok, type ActionResult } from "./action-result";
import { ImageError, processImage } from "./images";
import { isValidStateCode } from "./states-meta";
import type { StoreName } from "./db";
import { blobKey, cityById, mutate, nearestCity, now, R, uid } from "./store";
import type { Album, CityLog, CityRef, JournalEntry, Photo, Place, Trip, TripStop, VisitStatus } from "./types";
import {
  albumSchema,
  cityLogSchema,
  customCitySchema,
  fieldErrors,
  journalSchema,
  photoMetaSchema,
  placeSchema,
  stateNotesSchema,
  tripSchema,
  tripStopSchema,
  visitStatusSchema,
} from "./validation";

/* Same operations (and result shapes) as the server version's actions. */

function invalid(error: z.ZodError) {
  const fe = fieldErrors(error);
  return fail(Object.values(fe)[0] ?? "Check the highlighted fields", fe);
}

async function guard<T>(fn: () => Promise<T>): Promise<T | ReturnType<typeof fail>> {
  try {
    return await fn();
  } catch (e) {
    console.error(e);
    const msg = (e as Error).name === "QuotaExceededError" ? "This browser has run out of storage space for the journal." : `Couldn't save: ${(e as Error).message}`;
    return fail(msg);
  }
}

function logFor(cityId: number): CityLog {
  return (
    R.cityLogs.get(cityId) ?? {
      cityId,
      status: "not_visited",
      visitedOn: null,
      visitedUntil: null,
      rating: null,
      impression: null,
      notes: null,
      tags: [],
      coverPhotoId: null,
      createdAt: now(),
      updatedAt: now(),
    }
  );
}

/* ------------------------------ cities ------------------------------ */

export async function setCityStatus(cityId: number, status: string): Promise<ActionResult> {
  const st = visitStatusSchema.safeParse(status);
  if (!st.success || !cityById(cityId)) return fail("Invalid city or status");
  return guard(async () => {
    await mutate({ put: [["cityLogs", { ...logFor(cityId), status: st.data as VisitStatus, updatedAt: now() }]] });
    return ok();
  });
}

export async function saveCityLog(cityId: number, input: unknown): Promise<ActionResult> {
  if (!cityById(cityId)) return fail("City not found");
  const parsed = cityLogSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { status, ...v } = parsed.data;
  const cur = logFor(cityId);
  const nextStatus = status ?? (v.visitedOn ? "visited" : cur.status);
  return guard(async () => {
    await mutate({ put: [["cityLogs", { ...cur, ...v, status: nextStatus, updatedAt: now() }]] });
    return ok();
  });
}

export async function clearCityLog(cityId: number): Promise<ActionResult> {
  return guard(async () => {
    await mutate({
      del: [["cityLogs", cityId], ...[...R.places.values()].filter((p) => p.cityId === cityId).map((p) => ["places", p.id] as ["places", string])],
    });
    return ok();
  });
}

export async function setCityCover(cityId: number, photoId: string): Promise<ActionResult> {
  const p = R.photos.get(photoId);
  if (!p || p.cityId !== cityId) return fail("That photo isn't in this city's album");
  return guard(async () => {
    await mutate({ put: [["cityLogs", { ...logFor(cityId), coverPhotoId: photoId, updatedAt: now() }]] });
    return ok();
  });
}

export async function addCustomCity(input: unknown): Promise<ActionResult<{ id: number }>> {
  const parsed = customCitySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data;
  if (!isValidStateCode(v.stateCode)) return fail("Choose a state", { stateCode: "Choose a state" });
  const existing = [...R.customCities.values()].find((c) => c.name.toLowerCase() === v.name.toLowerCase() && c.state === v.stateCode.toUpperCase());
  if (existing) return ok({ id: existing.id });
  const id = 1_000_000_000 + Math.floor(Math.random() * 999_999_999);
  return guard(async () => {
    await mutate({
      put: [
        ["customCities", { id, name: v.name, state: v.stateCode.toUpperCase(), lat: v.lat, lon: v.lon, pop: 0, custom: true }],
        ["cityLogs", { ...logFor(id), cityId: id }],
      ],
    });
    return ok({ id });
  });
}

export async function addPlace(cityId: number, input: unknown): Promise<ActionResult<{ id: string }>> {
  if (!cityById(cityId)) return fail("City not found");
  const parsed = placeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const place: Place = { ...parsed.data, id: uid(), cityId, createdAt: now() } as Place;
  return guard(async () => {
    await mutate({ put: [["places", place]] });
    return ok({ id: place.id });
  });
}

export async function updatePlace(placeId: string, input: unknown): Promise<ActionResult> {
  const cur = R.places.get(placeId);
  if (!cur) return fail("Place not found");
  const parsed = placeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return guard(async () => {
    await mutate({ put: [["places", { ...cur, ...parsed.data }]] });
    return ok();
  });
}

export async function deletePlace(placeId: string): Promise<ActionResult> {
  return guard(async () => {
    await mutate({ del: [["places", placeId]] });
    return ok();
  });
}

export async function saveStateNotes(code: string, input: unknown): Promise<ActionResult> {
  if (!isValidStateCode(code)) return fail("Unknown state");
  const parsed = stateNotesSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const cur = R.stateLogs.get(code) ?? { code, notes: null, coverPhotoId: null, updatedAt: now() };
  return guard(async () => {
    await mutate({ put: [["stateLogs", { ...cur, notes: parsed.data.notes, updatedAt: now() }]] });
    return ok();
  });
}

export async function setStateCover(code: string, photoId: string): Promise<ActionResult> {
  const p = R.photos.get(photoId);
  if (!p?.cityId || cityById(p.cityId)?.state !== code) return fail("That photo isn't from this state");
  const cur = R.stateLogs.get(code) ?? { code, notes: null, coverPhotoId: null, updatedAt: now() };
  return guard(async () => {
    await mutate({ put: [["stateLogs", { ...cur, coverPhotoId: photoId, updatedAt: now() }]] });
    return ok();
  });
}

/* ------------------------------ trips ------------------------------ */

export async function createTrip(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = tripSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const t: Trip = { ...parsed.data, id: uid(), coverPhotoId: null, createdAt: now(), updatedAt: now() };
  return guard(async () => {
    await mutate({ put: [["trips", t]] });
    return ok({ id: t.id });
  });
}

export async function updateTrip(id: string, input: unknown): Promise<ActionResult> {
  const cur = R.trips.get(id);
  if (!cur) return fail("Trip not found");
  const parsed = tripSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return guard(async () => {
    await mutate({ put: [["trips", { ...cur, ...parsed.data, updatedAt: now() }]] });
    return ok();
  });
}

/** Deletes the trip and its route. Photos, albums and entries stay, unlinked. */
export async function deleteTrip(id: string): Promise<ActionResult> {
  if (!R.trips.has(id)) return fail("Trip not found");
  return guard(async () => {
    await mutate({
      del: [["trips", id], ...[...R.tripStops.values()].filter((s) => s.tripId === id).map((s) => ["tripStops", s.id] as ["tripStops", string])],
      put: [
        ...[...R.photos.values()].filter((p) => p.tripId === id).map((p) => ["photos", { ...p, tripId: null }] as ["photos", Photo]),
        ...[...R.journal.values()].filter((e) => e.tripId === id).map((e) => ["journal", { ...e, tripId: null }] as ["journal", JournalEntry]),
        ...[...R.albums.values()].filter((a) => a.tripId === id).map((a) => ["albums", { ...a, tripId: null }] as ["albums", Album]),
      ],
    });
    return ok();
  });
}

export async function addTripStop(tripId: string, input: unknown): Promise<ActionResult> {
  if (!R.trips.has(tripId)) return fail("Trip not found");
  const parsed = tripStopSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (!cityById(parsed.data.cityId)) return fail("City not found");
  const positions = [...R.tripStops.values()].filter((s) => s.tripId === tripId).map((s) => s.position);
  const stop: TripStop = { id: uid(), tripId, ...parsed.data, position: positions.length ? Math.max(...positions) + 1 : 0 };
  return guard(async () => {
    await mutate({ put: [["tripStops", stop]] });
    return ok();
  });
}

export async function updateTripStop(stopId: string, input: unknown): Promise<ActionResult> {
  const cur = R.tripStops.get(stopId);
  if (!cur) return fail("Stop not found");
  const parsed = tripStopSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { arriveOn, departOn, notes } = parsed.data;
  return guard(async () => {
    await mutate({ put: [["tripStops", { ...cur, arriveOn, departOn, notes }]] });
    return ok();
  });
}

export async function removeTripStop(stopId: string): Promise<ActionResult> {
  return guard(async () => {
    await mutate({ del: [["tripStops", stopId]] });
    return ok();
  });
}

export async function reorderTripStops(tripId: string, stopIds: string[]): Promise<ActionResult> {
  return guard(async () => {
    await mutate({
      put: stopIds.flatMap((id, i) => {
        const s = R.tripStops.get(id);
        return s && s.tripId === tripId ? [["tripStops", { ...s, position: i }] as ["tripStops", TripStop]] : [];
      }),
    });
    return ok();
  });
}

export async function setTripCover(tripId: string, photoId: string): Promise<ActionResult> {
  const t = R.trips.get(tripId);
  if (!t || !R.photos.has(photoId)) return fail("Photo not found");
  return guard(async () => {
    await mutate({ put: [["trips", { ...t, coverPhotoId: photoId, updatedAt: now() }]] });
    return ok();
  });
}

export async function addPhotosToTrip(tripId: string, photoIds: string[]): Promise<ActionResult> {
  if (!R.trips.has(tripId)) return fail("Trip not found");
  return guard(async () => {
    await mutate({ put: photoIds.flatMap((id) => (R.photos.has(id) ? [["photos", { ...R.photos.get(id)!, tripId }] as ["photos", Photo]] : [])) });
    return ok();
  });
}

/* ------------------------------ photos ------------------------------ */

export type UploadTarget = { cityId?: number; tripId?: string; albumId?: string; journalEntryId?: string };

/** Processes and stores one photo on this device. */
export async function uploadPhoto(file: File, target: UploadTarget): Promise<ActionResult<{ photo: Photo; autoCity: CityRef | null }>> {
  if (target.cityId && !cityById(target.cityId)) return fail("City not found");
  if (target.tripId && !R.trips.has(target.tripId)) return fail("Trip not found");
  if (target.albumId && !R.albums.has(target.albumId)) return fail("Album not found");
  if (target.journalEntryId && !R.journal.has(target.journalEntryId)) return fail("Journal entry not found");
  let img;
  try {
    img = await processImage(file);
  } catch (e) {
    return fail(e instanceof ImageError ? e.message : "Couldn't process this photo");
  }
  // No city chosen: file the photo under the nearest city from its GPS location.
  const autoCity = !target.cityId && img.gps ? nearestCity(img.gps.lat, img.gps.lon) : null;
  if (autoCity) target = { ...target, cityId: autoCity.id };
  const id = uid();
  const cityPositions = target.cityId ? [...R.photos.values()].filter((p) => p.cityId === target.cityId).map((p) => p.position) : [];
  const photo: Photo = {
    id,
    cityId: target.cityId ?? null,
    tripId: target.tripId ?? null,
    originalName: file.name || null,
    mimeType: file.type || "image/jpeg",
    sizeBytes: file.size,
    width: img.width,
    height: img.height,
    dominantColor: img.dominantColor,
    takenOn: img.takenOn,
    caption: null,
    description: null,
    position: cityPositions.length ? Math.max(...cityPositions) + 1 : 0,
    createdAt: now(),
  };
  const put: [StoreName, object][] = [["photos", photo]];
  if (target.albumId) {
    const n = [...R.albumPhotos.values()].filter((a) => a.albumId === target.albumId).length;
    put.push(["albumPhotos", { albumId: target.albumId, photoId: id, position: n, addedAt: now() }]);
    put.push(["albums", { ...R.albums.get(target.albumId)!, updatedAt: now() }]);
  }
  if (target.journalEntryId) {
    const n = [...R.journalPhotos.values()].filter((j) => j.entryId === target.journalEntryId).length;
    put.push(["journalPhotos", { entryId: target.journalEntryId, photoId: id, position: n }]);
  }
  return guard(async () => {
    await mutate({
      put,
      putBlobs: [
        [blobKey(id, "original"), file],
        [blobKey(id, "display"), img.display],
        [blobKey(id, "thumb"), img.thumb],
      ],
    });
    void navigator.storage?.persist?.();
    return ok({ photo, autoCity });
  });
}

export async function updatePhoto(photoId: string, input: unknown): Promise<ActionResult> {
  const cur = R.photos.get(photoId);
  if (!cur) return fail("Photo not found");
  const parsed = photoMetaSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return guard(async () => {
    await mutate({ put: [["photos", { ...cur, ...parsed.data }]] });
    return ok();
  });
}

export async function deletePhotos(photoIds: string[]): Promise<ActionResult<{ deleted: number }>> {
  const ids = new Set(photoIds.filter((id) => R.photos.has(id)));
  if (!ids.size) return fail("Photo not found");
  return guard(async () => {
    await mutate({
      del: [
        ...[...ids].map((id) => ["photos", id] as ["photos", string]),
        ...[...R.albumPhotos.values()].filter((a) => ids.has(a.photoId)).map((a) => ["albumPhotos", `${a.albumId}|${a.photoId}`] as ["albumPhotos", string]),
        ...[...R.journalPhotos.values()].filter((j) => ids.has(j.photoId)).map((j) => ["journalPhotos", `${j.entryId}|${j.photoId}`] as ["journalPhotos", string]),
      ],
      delBlobs: [...ids].flatMap((id) => ["original", "display", "thumb"].map((v) => blobKey(id, v))),
    });
    return ok({ deleted: ids.size });
  });
}

export async function reorderCityPhotos(cityId: number, photoIds: string[]): Promise<ActionResult> {
  return guard(async () => {
    await mutate({
      put: photoIds.flatMap((id, i) => {
        const p = R.photos.get(id);
        return p && p.cityId === cityId ? [["photos", { ...p, position: i }] as ["photos", Photo]] : [];
      }),
    });
    return ok();
  });
}

/* ------------------------------ albums ------------------------------ */

export async function createAlbum(input: unknown, photoIds: string[] = []): Promise<ActionResult<{ id: string }>> {
  const parsed = albumSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (parsed.data.tripId && !R.trips.has(parsed.data.tripId)) return fail("Trip not found");
  const album: Album = { ...parsed.data, id: uid(), coverPhotoId: null, createdAt: now(), updatedAt: now() };
  return guard(async () => {
    await mutate({
      put: [
        ["albums", album],
        ...photoIds.filter((p) => R.photos.has(p)).map((photoId, i) => ["albumPhotos", { albumId: album.id, photoId, position: i, addedAt: now() }] as ["albumPhotos", object]),
      ],
    });
    return ok({ id: album.id });
  });
}

export async function updateAlbum(id: string, input: unknown): Promise<ActionResult> {
  const cur = R.albums.get(id);
  if (!cur) return fail("Album not found");
  const parsed = albumSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return guard(async () => {
    await mutate({ put: [["albums", { ...cur, ...parsed.data, updatedAt: now() }]] });
    return ok();
  });
}

export async function deleteAlbum(id: string): Promise<ActionResult> {
  return guard(async () => {
    await mutate({
      del: [["albums", id], ...[...R.albumPhotos.values()].filter((a) => a.albumId === id).map((a) => ["albumPhotos", `${a.albumId}|${a.photoId}`] as ["albumPhotos", string])],
    });
    return ok();
  });
}

export async function addPhotosToAlbum(albumId: string, photoIds: string[]): Promise<ActionResult> {
  const album = R.albums.get(albumId);
  if (!album) return fail("Album not found");
  const existing = [...R.albumPhotos.values()].filter((a) => a.albumId === albumId);
  const have = new Set(existing.map((a) => a.photoId));
  const fresh = photoIds.filter((p) => R.photos.has(p) && !have.has(p));
  return guard(async () => {
    await mutate({
      put: [
        ...fresh.map((photoId, i) => ["albumPhotos", { albumId, photoId, position: existing.length + i, addedAt: now() }] as ["albumPhotos", object]),
        ["albums", { ...album, updatedAt: now() }],
      ],
    });
    return ok();
  });
}

export async function removePhotosFromAlbum(albumId: string, photoIds: string[]): Promise<ActionResult> {
  const album = R.albums.get(albumId);
  if (!album) return fail("Album not found");
  return guard(async () => {
    await mutate({
      del: photoIds.map((p) => ["albumPhotos", `${albumId}|${p}`] as ["albumPhotos", string]),
      put: album.coverPhotoId && photoIds.includes(album.coverPhotoId) ? [["albums", { ...album, coverPhotoId: null }]] : [],
    });
    return ok();
  });
}

export async function reorderAlbum(albumId: string, photoIds: string[]): Promise<ActionResult> {
  return guard(async () => {
    await mutate({
      put: photoIds.flatMap((photoId, i) => {
        const a = R.albumPhotos.get(`${albumId}|${photoId}`);
        return a ? [["albumPhotos", { ...a, position: i }] as ["albumPhotos", object]] : [];
      }),
    });
    return ok();
  });
}

export async function setAlbumCover(albumId: string, photoId: string): Promise<ActionResult> {
  const album = R.albums.get(albumId);
  if (!album || !R.albumPhotos.has(`${albumId}|${photoId}`)) return fail("That photo isn't in this album");
  return guard(async () => {
    await mutate({ put: [["albums", { ...album, coverPhotoId: photoId, updatedAt: now() }]] });
    return ok();
  });
}

/* ------------------------------ journal ------------------------------ */

function entryPhotoRows(entryId: string, photoIds: string[]) {
  return [...new Set(photoIds)].filter((p) => R.photos.has(p)).map((photoId, position) => ["journalPhotos", { entryId, photoId, position }] as ["journalPhotos", object]);
}

export async function createJournalEntry(input: unknown, photoIds: string[] = []): Promise<ActionResult<{ id: string }>> {
  const parsed = journalSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (parsed.data.cityId && !cityById(parsed.data.cityId)) return fail("City not found");
  if (parsed.data.tripId && !R.trips.has(parsed.data.tripId)) return fail("Trip not found");
  const e: JournalEntry = { ...parsed.data, id: uid(), createdAt: now(), updatedAt: now() };
  return guard(async () => {
    await mutate({ put: [["journal", e], ...entryPhotoRows(e.id, photoIds)] });
    return ok({ id: e.id });
  });
}

export async function updateJournalEntry(id: string, input: unknown, photoIds?: string[]): Promise<ActionResult> {
  const cur = R.journal.get(id);
  if (!cur) return fail("Entry not found");
  const parsed = journalSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const oldLinks = [...R.journalPhotos.values()].filter((j) => j.entryId === id);
  return guard(async () => {
    await mutate({
      del: photoIds ? oldLinks.map((j) => ["journalPhotos", `${j.entryId}|${j.photoId}`] as ["journalPhotos", string]) : [],
      put: [["journal", { ...cur, ...parsed.data, updatedAt: now() }], ...(photoIds ? entryPhotoRows(id, photoIds) : [])],
    });
    return ok();
  });
}

export async function detachPhotoFromEntry(id: string, photoId: string): Promise<ActionResult> {
  return guard(async () => {
    await mutate({ del: [["journalPhotos", `${id}|${photoId}`]] });
    return ok();
  });
}

export async function deleteJournalEntry(id: string): Promise<ActionResult> {
  return guard(async () => {
    await mutate({
      del: [["journal", id], ...[...R.journalPhotos.values()].filter((j) => j.entryId === id).map((j) => ["journalPhotos", `${j.entryId}|${j.photoId}`] as ["journalPhotos", string])],
    });
    return ok();
  });
}
