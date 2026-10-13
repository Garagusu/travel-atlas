import { NextResponse } from "next/server";
import { apiUser } from "@/lib/api";
import { searchPlaces } from "@/lib/data";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await apiUser();
  if (user instanceof NextResponse) return user;
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").slice(0, 80);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 12) || 12, 30);
  return NextResponse.json(await searchPlaces(user.id, q, limit));
}
