import { NextResponse } from "next/server";
import { apiUser } from "@/lib/api";
import { listMapPhotos } from "@/lib/data";

export const runtime = "nodejs";

/** The signed-in user's photos that have a location, for the photo layer on the big map. */
export async function GET() {
  const user = await apiUser();
  if (user instanceof NextResponse) return user;
  return NextResponse.json(await listMapPhotos(user.id), { headers: { "Cache-Control": "no-store" } });
}
