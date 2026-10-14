import { useMemo, useSyncExternalStore } from "react";
import { blobKey, db, RECORD_STORES, type StoreName } from "./db";
import { STATE_BY_CODE, TOTAL_STATES } from "./states-meta";
import type {
  Album,
  AlbumPhoto,
  CityLog,
  CityRef,
  JournalEntry,
  JournalPhoto,
  Photo,
  PhotoItem,
  Place,
  StateLog,
  Trip,
  TripStop,
  VisitStatus,
} from "./types";

/* ------------------------------------------------------------------ */
/* In-memory state mirrored to IndexedDB                               */
/* ------------------------------------------------------------------ */

type Records = {
  cityLogs: Map<number, CityLog>;
  stateLogs: Map<string, StateLog>;
  customCities: Map<number, CityRef>;
  places: Map<string, Place>;
  trips: Map<string, Trip>;
  tripStops: Map<string, TripStop>;
  photos: Map<string, Photo>;
  albums: Map<string, Album>;
  albumPhotos: Map<string, AlbumPhoto>;
  journal: Map<string, JournalEntry>;
  journalPhotos: Map<string, JournalPhoto>;
};

const emptyRecords = (): Records => ({
  cityLogs: new Map(),
  stateLogs: new Map(),
  customCities: new Map(),
  places: new Map(),
  trips: new Map(),
  tripStops: new Map(),
  photos: new Map(),
  albums: new Map(),
  albumPhotos: new Map(),
  journal: new Map(),
  journalPhotos: new Map(),
});

export const R: Records = emptyRecords();

/** Memory key for each store (composite keys are joined with "|"). */
function memKey(store: StoreName, v: Record<string, unknown>): string | number {
  switch (store) {
    case "cityLogs":
      return v.cityId as number;
    case "stateLogs":
      return v.code as string;
    case "albumPhotos":
      return `${v.albumId}|${v.photoId}`;
    case "journalPhotos":
      return `${v.entryId}|${v.photoId}`;
    default:
      return v.id as string | number;
  }
}
const idbKey = (store: StoreName, k: string | number) =>
  store === "albumPhotos" || store === "journalPhotos" ? (String(k).split("|") as [string, string]) : k;

/* ---------------- reference cities ---------------- */

export type BaseCities = { ids: number[]; names: string[]; states: string[]; lon: number[]; lat: number[]; pop: number[] };
export let BASE: BaseCities = { ids: [], names: [], states: [], lon: [], lat: [], pop: [] };
const baseIndex = new Map<number, number>();

export function cityById(id: number): CityRef | null {
  const i = baseIndex.get(id);
  if (i !== undefined)
    return { id, name: BASE.names[i], state: BASE.states[i], lat: BASE.lat[i], lon: BASE.lon[i], pop: BASE.pop[i] };
  const c = R.customCities.get(id);
  return c ? { ...c, custom: true } : null;
}

/* ---------------- change notification ---------------- */

let version = 0;
const listeners = new Set<() => void>();
function emit() {
  version++;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Re-runs `select` whenever any record changes. */
export function useStore<T>(select: () => T, deps: unknown[] = []): T {
  const v = useSyncExternalStore(subscribe, () => version);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(select, [v, ...deps]);
}

/* ---------------- loading ---------------- */

let ready: Promise<void> | null = null;
export function loadStore() {
  ready ??= (async () => {
    const res = await fetch(new URL("data/cities.json", document.baseURI));
    if (!res.ok) throw new Error(`Couldn't load the city list (${res.status})`);
    BASE = await res.json();
    BASE.ids.forEach((id, i) => baseIndex.set(id, i));
    const d = await db();
    for (const s of RECORD_STORES) {
      const all = await d.getAll(s);
      const m = R[s] as Map<string | number, unknown>;
      for (const v of all) m.set(memKey(s, v as Record<string, unknown>), v);
    }
    emit();
  })();
  return ready;
}

/* ---------------- writes ---------------- */

type Change = { put?: [StoreName, object][]; del?: [StoreName, string | number][]; putBlobs?: [string, Blob][]; delBlobs?: string[] };

/** Applies changes to IndexedDB in one transaction, then to memory. */
async function commit(c: Change) {
  const d = await db();
  const stores = new Set<string>([...(c.put ?? []).map((p) => p[0]), ...(c.del ?? []).map((p) => p[0])]);
  if (c.putBlobs?.length || c.delBlobs?.length) stores.add("blobs");
  if (!stores.size) return;
  const tx = d.transaction([...stores] as never[], "readwrite");
  for (const [s, v] of c.put ?? []) void tx.objectStore(s as never).put(v as never);
  for (const [s, k] of c.del ?? []) void tx.objectStore(s as never).delete(idbKey(s, k) as never);
  for (const [k, b] of c.putBlobs ?? []) void tx.objectStore("blobs" as never).put(b as never, k as never);
  for (const k of c.delBlobs ?? []) void tx.objectStore("blobs" as never).delete(k as never);
  await tx.done;
  for (const [s, v] of c.put ?? []) (R[s] as Map<string | number, unknown>).set(memKey(s, v as Record<string, unknown>), v);
  for (const [s, k] of c.del ?? []) (R[s] as Map<string | number, unknown>).delete(k);
  emit();
}

export async function getBlob(photoId: string, variant: string) {
  return (await db()).get("blobs", blobKey(photoId, variant));
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();
const vals = <T,>(m: Map<unknown, T>) => [...m.values()];
const byDateDesc = (a: string | null, b: string | null) => (b ?? "").localeCompare(a ?? "");

export function withCity(p: Photo): PhotoItem {
  const c = p.cityId ? cityById(p.cityId) : null;
  return { ...p, cityName: c?.name ?? null, stateCode: c?.state ?? null };
}

export function statusOf(cityId: number): VisitStatus {
  return R.cityLogs.get(cityId)?.status ?? "not_visited";
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export function getStats() {
  const visitedStates = new Set<string>();
  const wantedStates = new Set<string>();
  let citiesVisited = 0;
  let citiesWanted = 0;
  for (const l of R.cityLogs.values()) {
    const c = cityById(l.cityId);
    if (!c) continue;
    const isState = STATE_BY_CODE.get(c.state)?.isState;
    if (l.status === "visited") {
      citiesVisited++;
      if (isState) visitedStates.add(c.state);
    } else if (l.status === "want_to_visit") {
      citiesWanted++;
      if (isState) wantedStates.add(c.state);
    }
  }
  for (const s of visitedStates) wantedStates.delete(s);
  return {
    statesVisited: visitedStates.size,
    statesWanted: wantedStates.size,
    citiesVisited,
    citiesWanted,
    trips: R.trips.size,
    photos: R.photos.size,
    journalEntries: R.journal.size,
    percentExplored: Math.round((visitedStates.size / TOTAL_STATES) * 100),
    totalStates: TOTAL_STATES,
  };
}
export type TravelStats = ReturnType<typeof getStats>;

export function getStateStatuses() {
  const m = new Map<string, { code: string; visited: number; wanted: number }>();
  for (const l of R.cityLogs.values()) {
    if (l.status === "not_visited") continue;
    const c = cityById(l.cityId);
    if (!c) continue;
    const e = m.get(c.state) ?? { code: c.state, visited: 0, wanted: 0 };
    if (l.status === "visited") e.visited++;
    else e.wanted++;
    m.set(c.state, e);
  }
  return [...m.values()];
}

/** The user's cities for the map overlay: s = 0 not visited, 1 want, 2 visited. */
export function getMapStatuses() {
  const out: (CityRef & { s: 0 | 1 | 2; custom: boolean })[] = [];
  const seen = new Set<number>();
  for (const l of R.cityLogs.values()) {
    const c = cityById(l.cityId);
    if (!c) continue;
    seen.add(c.id);
    out.push({ ...c, custom: !!c.custom, s: l.status === "visited" ? 2 : l.status === "want_to_visit" ? 1 : 0 });
  }
  for (const c of R.customCities.values()) if (!seen.has(c.id)) out.push({ ...c, custom: true, s: 0 });
  return out;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function searchPlaces(q: string, limit = 12) {
  const term = norm(q.trim());
  if (!term) return { states: [], cities: [] };
  const states = [...STATE_BY_CODE.values()]
    .filter((s) => norm(s.name).startsWith(term) || s.code.toLowerCase() === term)
    .slice(0, 5)
    .map((s) => ({ code: s.code, name: s.name }));
  const hits: { rank: number; i: number; custom?: CityRef }[] = [];
  for (let i = 0; i < BASE.ids.length; i++) {
    const n = norm(BASE.names[i]);
    const at = n.indexOf(term);
    if (at < 0) continue;
    hits.push({ rank: n === term ? 0 : at === 0 ? 1 : 2, i });
  }
  for (const c of R.customCities.values()) {
    const n = norm(c.name);
    const at = n.indexOf(term);
    if (at >= 0) hits.push({ rank: n === term ? 0 : at === 0 ? 1 : 2, i: -1, custom: c });
  }
  // BASE is sorted by population, so a stable sort by rank keeps big cities first
  hits.sort((a, b) => a.rank - b.rank);
  const cities = hits.slice(0, limit).map((h) => {
    const c = h.custom ?? cityById(BASE.ids[h.i])!;
    return { id: c.id, name: c.name, state: c.state, lat: c.lat, lon: c.lon, population: c.pop, status: statusOf(c.id) };
  });
  return { states, cities };
}

export function cityPhotos(cityId: number) {
  return vals(R.photos)
    .filter((p) => p.cityId === cityId)
    .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt))
    .map(withCity);
}

export function cityCover(cityId: number) {
  const chosen = R.cityLogs.get(cityId)?.coverPhotoId;
  if (chosen && R.photos.has(chosen)) return chosen;
  return cityPhotos(cityId)[0]?.id ?? null;
}

export type CityListItem = ReturnType<typeof cityListItem>;
function cityListItem(l: CityLog) {
  const c = cityById(l.cityId)!;
  return {
    id: c.id,
    name: c.name,
    stateCode: c.state,
    stateName: STATE_BY_CODE.get(c.state)?.name ?? c.state,
    lat: c.lat,
    lon: c.lon,
    population: c.pop,
    status: l.status,
    visitedOn: l.visitedOn,
    rating: l.rating,
    impression: l.impression,
    tags: l.tags,
    notes: l.notes,
    updatedAt: l.updatedAt,
    cover: cityCover(c.id),
    photoCount: vals(R.photos).filter((p) => p.cityId === c.id).length,
    placeCount: vals(R.places).filter((p) => p.cityId === c.id).length,
  };
}

const STATUS_ORDER: Record<VisitStatus, number> = { visited: 0, want_to_visit: 1, not_visited: 2 };

export function listMyCities(f: { status?: VisitStatus | "all"; state?: string; tag?: string; q?: string } = {}) {
  return vals(R.cityLogs)
    .filter((l) => cityById(l.cityId))
    .map(cityListItem)
    .filter((c) => !f.status || f.status === "all" || c.status === f.status)
    .filter((c) => !f.state || c.stateCode === f.state.toUpperCase())
    .filter((c) => !f.tag || c.tags.includes(f.tag))
    .filter((c) => !f.q || norm(c.name).includes(norm(f.q)))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || byDateDesc(a.visitedOn, b.visitedOn) || b.updatedAt.localeCompare(a.updatedAt));
}

export function recentVisitedCities(limit = 3) {
  return listMyCities({ status: "visited" }).slice(0, limit);
}

export function wishlist(limit?: number) {
  const list = listMyCities({ status: "want_to_visit" }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return limit ? list.slice(0, limit) : list;
}

export function cityPlaces(cityId: number) {
  return vals(R.places)
    .filter((p) => p.cityId === cityId)
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

export function tripsForCity(cityId: number) {
  const ids = new Set(vals(R.tripStops).filter((s) => s.cityId === cityId).map((s) => s.tripId));
  return [...ids].map((id) => R.trips.get(id)!).filter(Boolean).sort((a, b) => byDateDesc(a.startDate, b.startDate));
}

export function journalForCity(cityId: number) {
  return vals(R.journal).filter((e) => e.cityId === cityId).sort((a, b) => b.entryDate.localeCompare(a.entryDate));
}

export function nearbyCities(lat: number, lon: number, excludeId: number, radius = 0.7, limit = 14) {
  const out: { id: number; name: string; lat: number; lon: number }[] = [];
  for (let i = 0; i < BASE.ids.length && out.length < limit; i++) {
    if (BASE.ids[i] === excludeId) continue;
    if (Math.abs(BASE.lat[i] - lat) <= radius && Math.abs(BASE.lon[i] - lon) <= radius * 1.3)
      out.push({ id: BASE.ids[i], name: BASE.names[i], lat: BASE.lat[i], lon: BASE.lon[i] });
  }
  return out;
}

export function citiesInState(code: string) {
  const out: CityRef[] = [];
  for (let i = 0; i < BASE.ids.length; i++) if (BASE.states[i] === code) out.push(cityById(BASE.ids[i])!);
  for (const c of R.customCities.values()) if (c.state === code) out.push({ ...c, custom: true });
  return out; // already population-ordered
}

export function getStateDetail(code: string) {
  const myCities = listMyCities({ state: code });
  const all = citiesInState(code);
  const photos = vals(R.photos)
    .filter((p) => p.cityId && cityById(p.cityId)?.state === code)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(withCity);
  const entries = vals(R.journal)
    .filter((e) => e.cityId && cityById(e.cityId)?.state === code)
    .sort((a, b) => b.entryDate.localeCompare(a.entryDate))
    .slice(0, 10)
    .map((e) => ({ ...e, cityName: cityById(e.cityId!)!.name }));
  const tripIds = new Set(vals(R.tripStops).filter((s) => cityById(s.cityId)?.state === code).map((s) => s.tripId));
  const trips = [...tripIds].map((id) => R.trips.get(id)!).filter(Boolean).sort((a, b) => byDateDesc(a.startDate, b.startDate));
  const log = R.stateLogs.get(code) ?? null;
  const coverId = log?.coverPhotoId && R.photos.has(log.coverPhotoId) ? log.coverPhotoId : (photos[0]?.id ?? null);
  return { myCities, topCities: all.slice(0, 24), totalCities: all.length, photos: photos.slice(0, 60), photoCount: photos.length, entries, trips, log, coverId };
}

export function tripCover(t: Trip) {
  if (t.coverPhotoId && R.photos.has(t.coverPhotoId)) return t.coverPhotoId;
  return tripPhotos(t.id)[0]?.id ?? null;
}

export function tripPhotos(tripId: string) {
  return vals(R.photos)
    .filter((p) => p.tripId === tripId)
    .sort((a, b) => (a.takenOn ?? "").localeCompare(b.takenOn ?? "") || a.position - b.position || a.createdAt.localeCompare(b.createdAt))
    .map(withCity);
}

export function tripStops(tripId: string) {
  return vals(R.tripStops)
    .filter((s) => s.tripId === tripId)
    .sort((a, b) => a.position - b.position)
    .map((s) => {
      const c = cityById(s.cityId)!;
      return { ...s, cityName: c?.name ?? "Unknown", stateCode: c?.state ?? "", lat: c?.lat ?? 0, lon: c?.lon ?? 0, status: statusOf(s.cityId) };
    });
}

export function listTrips() {
  return vals(R.trips)
    .map((t) => {
      const stops = tripStops(t.id);
      return {
        ...t,
        cover: tripCover(t),
        stopCount: stops.length,
        photoCount: vals(R.photos).filter((p) => p.tripId === t.id).length,
        stateCodes: [...new Set(stops.map((s) => s.stateCode))].sort(),
      };
    })
    .sort((a, b) => {
      if (!a.startDate && b.startDate) return -1;
      if (a.startDate && !b.startDate) return 1;
      return byDateDesc(a.startDate, b.startDate) || b.createdAt.localeCompare(a.createdAt);
    });
}

export function getTrip(id: string) {
  const t = R.trips.get(id);
  if (!t) return null;
  const entries = vals(R.journal)
    .filter((e) => e.tripId === id)
    .sort((a, b) => a.entryDate.localeCompare(b.entryDate))
    .map((e) => ({ ...e, cityName: e.cityId ? cityById(e.cityId)?.name ?? null : null }));
  const albums = vals(R.albums).filter((a) => a.tripId === id);
  return { ...t, cover: tripCover(t), stops: tripStops(id), photos: tripPhotos(id), entries, albums };
}

export function albumPhotoItems(albumId: string) {
  return vals(R.albumPhotos)
    .filter((ap) => ap.albumId === albumId && R.photos.has(ap.photoId))
    .sort((a, b) => a.position - b.position || a.addedAt.localeCompare(b.addedAt))
    .map((ap) => withCity(R.photos.get(ap.photoId)!));
}

export function listAlbums() {
  return vals(R.albums)
    .map((a) => {
      const items = albumPhotoItems(a.id);
      const cover = a.coverPhotoId && R.photos.has(a.coverPhotoId) ? a.coverPhotoId : (items[0]?.id ?? null);
      return { ...a, cover, photoCount: items.length };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getAlbum(id: string) {
  const a = R.albums.get(id);
  if (!a) return null;
  const photos = albumPhotoItems(id);
  const coverId = a.coverPhotoId && R.photos.has(a.coverPhotoId) ? a.coverPhotoId : (photos[0]?.id ?? null);
  return { ...a, tripName: a.tripId ? R.trips.get(a.tripId)?.name ?? null : null, photos, coverId };
}

export function allPhotos() {
  return vals(R.photos)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(withCity);
}

export function entryPhotos(entryId: string) {
  return vals(R.journalPhotos)
    .filter((jp) => jp.entryId === entryId && R.photos.has(jp.photoId))
    .sort((a, b) => a.position - b.position)
    .map((jp) => withCity(R.photos.get(jp.photoId)!));
}

export function listJournal(f: { q?: string; tag?: string; tripId?: string } = {}) {
  const q = f.q ? norm(f.q) : null;
  return vals(R.journal)
    .map((e) => {
      const c = e.cityId ? cityById(e.cityId) : null;
      const photos = entryPhotos(e.id);
      return {
        ...e,
        cityName: c?.name ?? null,
        stateCode: c?.state ?? null,
        tripName: e.tripId ? R.trips.get(e.tripId)?.name ?? null : null,
        cover: photos[0]?.id ?? null,
        photoCount: photos.length,
      };
    })
    .filter((e) => !f.tag || e.tags.includes(f.tag))
    .filter((e) => !f.tripId || e.tripId === f.tripId)
    .filter(
      (e) =>
        !q ||
        [e.title, e.body, e.highlights ?? "", e.cityName ?? "", ...e.tags, ...e.placesVisited].some((s) => norm(s).includes(q)),
    )
    .sort((a, b) => b.entryDate.localeCompare(a.entryDate) || b.createdAt.localeCompare(a.createdAt));
}

export function getJournalEntry(id: string) {
  const e = R.journal.get(id);
  if (!e) return null;
  const c = e.cityId ? cityById(e.cityId) : null;
  return {
    ...e,
    cityName: c?.name ?? null,
    stateCode: c?.state ?? null,
    tripName: e.tripId ? R.trips.get(e.tripId)?.name ?? null : null,
    photos: entryPhotos(id),
  };
}

export function journalTags() {
  const counts = new Map<string, number>();
  for (const e of R.journal.values()) for (const t of e.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].map(([tag, n]) => ({ tag, n })).sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag));
}

export function recentPhotos(limit = 9) {
  return allPhotos().slice(0, limit);
}

export function listTripOptions() {
  return listTrips().map((t) => ({ id: t.id, name: t.name, startDate: t.startDate }));
}

/* ------------------------------------------------------------------ */
/* Low-level mutations used by actions.ts                              */
/* ------------------------------------------------------------------ */

export const mutate = commit;
export { blobKey };
export function resetMemory() {
  const fresh = emptyRecords();
  for (const k of Object.keys(fresh) as (keyof Records)[]) (R[k] as Map<unknown, unknown>) = fresh[k] as Map<unknown, unknown>;
  emit();
}
export async function reloadFromDb() {
  const d = await db();
  for (const s of RECORD_STORES) {
    const m = R[s] as Map<string | number, unknown>;
    m.clear();
    for (const v of await d.getAll(s)) m.set(memKey(s, v as Record<string, unknown>), v);
  }
  emit();
}

/* ------------------------------------------------------------------ */
/* Saved places                                                        */
/* ------------------------------------------------------------------ */

export function listAllPlaces(f: { category?: string; state?: string; q?: string } = {}) {
  const q = f.q ? norm(f.q) : null;
  return vals(R.places)
    .map((p) => {
      const c = cityById(p.cityId);
      return c ? { ...p, address: p.address ?? null, cityName: c.name, stateCode: c.state, cityLat: c.lat, cityLon: c.lon } : null;
    })
    .filter((p): p is NonNullable<typeof p> => !!p)
    .filter((p) => !f.category || p.category === f.category)
    .filter((p) => !f.state || p.stateCode === f.state.toUpperCase())
    .filter((p) => !q || [p.name, p.notes ?? "", p.address ?? "", p.cityName].some((s) => norm(s).includes(q)))
    .sort(
      (a, b) =>
        a.stateCode.localeCompare(b.stateCode) ||
        a.cityName.localeCompare(b.cityName) ||
        Number(b.favorite) - Number(a.favorite) ||
        a.name.localeCompare(b.name),
    );
}

/** Places for the main map; unpinned places sit at their city. */
export function getMapPlaces() {
  return listAllPlaces().map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    address: p.address,
    notes: p.notes,
    favorite: p.favorite,
    cityId: p.cityId,
    cityName: p.cityName,
    stateCode: p.stateCode,
    lat: p.lat ?? p.cityLat,
    lon: p.lon ?? p.cityLon,
    pinned: p.lat !== null,
  }));
}

/** The closest city to a point (within maxKm), for filing photos by their GPS location. */
export function nearestCity(lat: number, lon: number, maxKm = 25): CityRef | null {
  const r = Math.PI / 180;
  const km = (bLat: number, bLon: number) => {
    const h = Math.sin(((bLat - lat) * r) / 2) ** 2 + Math.cos(lat * r) * Math.cos(bLat * r) * Math.sin(((bLon - lon) * r) / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
  };
  const dLat = maxKm / 111;
  let best: CityRef | null = null;
  let bestKm = maxKm;
  for (let i = 0; i < BASE.ids.length; i++) {
    if (Math.abs(BASE.lat[i] - lat) > dLat) continue;
    const d = km(BASE.lat[i], BASE.lon[i]);
    if (d <= bestKm) [best, bestKm] = [cityById(BASE.ids[i]), d];
  }
  for (const c of R.customCities.values()) {
    const d = km(c.lat, c.lon);
    if (d <= bestKm) [best, bestKm] = [c, d];
  }
  return best;
}
