import { NextResponse } from "next/server";
import { apiUser } from "@/lib/api";
import { getAllSeededCitiesCompact } from "@/lib/data";

export const runtime = "nodejs";

let cache: { body: string; etag: string } | undefined;

/**
 * All seeded US cities in a compact columnar form:
 * { ids, names, states, lon, lat, pop }. Reference data, identical for every user.
 */
export async function GET(req: Request) {
  const user = await apiUser();
  if (user instanceof NextResponse) return user;
  if (!cache) {
    const rows = await getAllSeededCitiesCompact();
    const body = JSON.stringify({
      ids: rows.map((r) => r.id),
      names: rows.map((r) => r.name),
      states: rows.map((r) => r.state),
      lon: rows.map((r) => Math.round(r.lon * 1e4) / 1e4),
      lat: rows.map((r) => Math.round(r.lat * 1e4) / 1e4),
      pop: rows.map((r) => r.pop),
    });
    cache = { body, etag: `"cities-${rows.length}-${rows.at(-1)?.id ?? 0}"` };
  }
  if (req.headers.get("if-none-match") === cache.etag) return new Response(null, { status: 304 });
  return new Response(cache.body, {
    headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=86400", ETag: cache.etag },
  });
}
