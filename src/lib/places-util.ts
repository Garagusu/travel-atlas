/**
 * Browser-side helpers for saved places: finding a place by name (OpenStreetMap
 * Nominatim, free, no key), reading coordinates out of a Google/Apple Maps link,
 * building "open in maps" links, and sharing recommendations.
 */

export type PlaceCategoryKey =
  | "restaurant"
  | "museum"
  | "attraction"
  | "activity"
  | "cafe"
  | "bar"
  | "hotel"
  | "park"
  | "shop"
  | "other";

export type FoundPlace = {
  name: string;
  address: string | null;
  lat: number;
  lon: number;
  category: PlaceCategoryKey;
  kind: string;
};

/** Map an OpenStreetMap class/type to one of our categories. */
export function guessCategory(osmClass: string, osmType: string): PlaceCategoryKey {
  const t = osmType.toLowerCase();
  const c = osmClass.toLowerCase();
  if (["restaurant", "fast_food", "food_court", "ice_cream", "bbq"].includes(t)) return "restaurant";
  if (["cafe", "coffee", "bakery"].includes(t)) return "cafe";
  if (["bar", "pub", "biergarten", "nightclub", "wine_bar"].includes(t)) return "bar";
  if (["museum", "gallery", "arts_centre"].includes(t)) return "museum";
  if (["hotel", "motel", "hostel", "guest_house", "camp_site", "apartment"].includes(t)) return "hotel";
  if (["park", "nature_reserve", "garden", "beach", "peak", "trailhead", "national_park"].includes(t) || c === "natural") return "park";
  if (c === "shop" || ["marketplace", "mall"].includes(t)) return "shop";
  if (["theatre", "cinema", "stadium", "zoo", "aquarium", "theme_park", "sports_centre", "water_park"].includes(t)) return "activity";
  if (c === "tourism" || c === "historic" || ["viewpoint", "monument", "memorial", "attraction", "artwork"].includes(t)) return "attraction";
  return "other";
}

type NominatimResult = {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  category?: string;
  class?: string;
  type: string;
  address?: Record<string, string>;
};

function shortAddress(a: Record<string, string> | undefined, fallback: string) {
  if (!a) return fallback.split(",").slice(1, 4).join(",").trim() || null;
  const street = [a.house_number, a.road].filter(Boolean).join(" ");
  const town = a.city || a.town || a.village || a.hamlet || a.suburb;
  const parts = [street, town, a.state].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/**
 * Search OpenStreetMap for a named place, preferring results near the city.
 * Follows Nominatim's usage policy: one request per search, results cached.
 */
const cache = new Map<string, FoundPlace[]>();
export async function searchOsm(query: string, near?: { lat: number; lon: number }, signal?: AbortSignal): Promise<FoundPlace[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const key = `${q}|${near?.lat.toFixed(2)}|${near?.lon.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const params = new URLSearchParams({ q, format: "jsonv2", addressdetails: "1", limit: "8", countrycodes: "us" });
  if (near) {
    const d = 0.35; // ~35 km box around the city, used as a preference, not a hard limit
    params.set("viewbox", `${near.lon - d},${near.lat + d},${near.lon + d},${near.lat - d}`);
  }
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Place search failed (${res.status})`);
  const rows: NominatimResult[] = await res.json();
  const out = rows.map((r) => ({
    name: r.name || r.display_name.split(",")[0],
    address: shortAddress(r.address, r.display_name),
    lat: Math.round(Number(r.lat) * 1e5) / 1e5,
    lon: Math.round(Number(r.lon) * 1e5) / 1e5,
    category: guessCategory(r.category ?? r.class ?? "", r.type),
    kind: r.type.replace(/_/g, " "),
  }));
  cache.set(key, out);
  return out;
}

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | undefined>;
};

/**
 * Search-as-you-type suggestions from Photon (OpenStreetMap data, komoot's
 * public server). Biased toward the city; US results only.
 */
const photonCache = new Map<string, FoundPlace[]>();
export async function searchPhoton(query: string, near?: { lat: number; lon: number }, signal?: AbortSignal): Promise<FoundPlace[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const key = `${q.toLowerCase()}|${near?.lat.toFixed(2)}|${near?.lon.toFixed(2)}`;
  const hit = photonCache.get(key);
  if (hit) return hit;
  const params = new URLSearchParams({ q, limit: "8", lang: "en", countrycode: "us" });
  if (near) {
    params.set("lat", near.lat.toFixed(4));
    params.set("lon", near.lon.toFixed(4));
    params.set("zoom", "12");
    params.set("location_bias_scale", "0.2");
  }
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, { signal });
  if (!res.ok) throw new Error(`Suggestions failed (${res.status})`);
  const data: { features?: PhotonFeature[] } = await res.json();
  const out: FoundPlace[] = [];
  for (const f of data.features ?? []) {
    const p = f.properties;
    if (p.countrycode && p.countrycode.toUpperCase() !== "US") continue;
    const street = [p.housenumber, p.street].filter(Boolean).join(" ");
    const name = p.name || street;
    if (!name) continue;
    const town = p.city || p.town || p.village || p.district || p.county;
    const address = [street && street !== name ? street : null, town, p.state].filter(Boolean).join(", ") || null;
    out.push({
      name,
      address,
      lat: Math.round(f.geometry.coordinates[1] * 1e5) / 1e5,
      lon: Math.round(f.geometry.coordinates[0] * 1e5) / 1e5,
      category: guessCategory(p.osm_key ?? "", p.osm_value ?? ""),
      kind: (p.osm_value ?? p.type ?? "").replace(/_/g, " "),
    });
  }
  photonCache.set(key, out);
  return out;
}

/**
 * Pull coordinates (and a name when present) out of a pasted map link.
 * Supports Google Maps place/search links and Apple Maps links.
 * Short links (maps.app.goo.gl) must be opened first to get the full address.
 */
export function parseMapsLink(text: string): { lat: number; lon: number; name?: string } | null {
  const s = text.trim();
  let m: RegExpMatchArray | null;
  const valid = (lat: number, lon: number) => Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
  let name: string | undefined;
  const placeName = s.match(/\/maps\/place\/([^/@?]+)/);
  if (placeName) name = decodeURIComponent(placeName[1].replace(/\+/g, " ")).trim();

  // !3d<lat>!4d<lon> is the exact pin of a Google place
  if ((m = s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/))) {
    const [lat, lon] = [Number(m[1]), Number(m[2])];
    if (valid(lat, lon)) return { lat, lon, name };
  }
  // @lat,lon,zoom (Google map view)
  if ((m = s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/))) {
    const [lat, lon] = [Number(m[1]), Number(m[2])];
    if (valid(lat, lon)) return { lat, lon, name };
  }
  // ?q=lat,lon / query= / ll= / sll= (Google and Apple)
  if ((m = s.match(/[?&](?:q|query|ll|sll|daddr|coordinate)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i))) {
    const [lat, lon] = [Number(m[1]), Number(m[2])];
    if (valid(lat, lon)) return { lat, lon, name };
  }
  // plain "42.3601, -71.0589"
  if ((m = s.match(/^(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/))) {
    const [lat, lon] = [Number(m[1]), Number(m[2])];
    if (valid(lat, lon)) return { lat, lon };
  }
  return null;
}

export const isShortMapsLink = (s: string) => /maps\.app\.goo\.gl|goo\.gl\/maps/i.test(s);

/** Link that opens the place in Google Maps (works on iPhone, Android and desktop). */
export function mapsUrl(p: { name: string; address?: string | null; lat?: number | null; lon?: number | null; cityName?: string; stateCode?: string }) {
  const label = [p.name, p.address ?? [p.cityName, p.stateCode].filter(Boolean).join(", ")].filter(Boolean).join(", ");
  if (p.lat != null && p.lon != null && !p.address) {
    return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label)}`;
}

type ShareablePlace = {
  name: string;
  category: string;
  categoryLabel: string;
  notes?: string | null;
  address?: string | null;
  url?: string | null;
  lat?: number | null;
  lon?: number | null;
  favorite?: boolean;
  cityName?: string;
  stateCode?: string;
};

/** Plain-text recommendation list, readable in any messaging app. */
export function recommendationText(title: string, places: ShareablePlace[]) {
  const lines = [title, ""];
  for (const p of places) {
    lines.push(`${p.favorite ? "★ " : "• "}${p.name} (${p.categoryLabel})`);
    if (p.notes) lines.push(`  ${p.notes}`);
    if (p.address) lines.push(`  ${p.address}`);
    lines.push(`  ${mapsUrl(p)}`);
    if (p.url) lines.push(`  ${p.url}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}

/** Share via the device share sheet when available, otherwise copy to the clipboard. */
export async function shareText(title: string, text: string): Promise<"shared" | "copied" | "cancelled"> {
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void>; canShare?: (d: ShareData) => boolean };
  if (nav.share && (!nav.canShare || nav.canShare({ title, text }))) {
    try {
      await nav.share({ title, text });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled";
    }
  }
  await navigator.clipboard.writeText(text);
  return "copied";
}

export const CATEGORY_COLORS: Record<PlaceCategoryKey, string> = {
  restaurant: "#c2410c",
  cafe: "#a16207",
  bar: "#9d174d",
  museum: "#4338ca",
  attraction: "#0f766e",
  activity: "#0369a1",
  park: "#15803d",
  shop: "#7c3aed",
  hotel: "#475569",
  other: "#57534e",
};

/** Share a link via the share sheet, or copy it. */
export async function shareUrl(title: string, url: string): Promise<"shared" | "copied" | "cancelled"> {
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (nav.share) {
    try {
      await nav.share({ title, url });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled";
    }
  }
  await navigator.clipboard.writeText(url);
  return "copied";
}
