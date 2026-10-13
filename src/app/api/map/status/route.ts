import { NextResponse } from "next/server";
import { apiUser } from "@/lib/api";
import { getMapStatuses, getStateStatuses, getStats } from "@/lib/data";

export const runtime = "nodejs";

/** The signed-in user's statuses — drives map colours. Never cached. */
export async function GET() {
  const user = await apiUser();
  if (user instanceof NextResponse) return user;
  const [cities, states, stats] = await Promise.all([
    getMapStatuses(user.id),
    getStateStatuses(user.id),
    getStats(user.id),
  ]);
  return NextResponse.json({ cities, states, stats }, { headers: { "Cache-Control": "no-store" } });
}
