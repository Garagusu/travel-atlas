import { NextResponse } from "next/server";
import { apiUser } from "@/lib/api";
import { getMapStatuses, getStateStatuses, getStats, listAllPlaces } from "@/lib/data";

export const runtime = "nodejs";

/** The signed-in user's statuses — drives map colours. Never cached. */
export async function GET() {
  const user = await apiUser();
  if (user instanceof NextResponse) return user;
  const [cities, states, stats, allPlaces] = await Promise.all([
    getMapStatuses(user.id),
    getStateStatuses(user.id),
    getStats(user.id),
    listAllPlaces(user.id),
  ]);
  // places without their own pin sit at the city's location on the map
  const places = allPlaces.map((p) => ({
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
  return NextResponse.json({ cities, states, stats, places }, { headers: { "Cache-Control": "no-store" } });
}
