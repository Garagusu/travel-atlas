import { NextResponse } from "next/server";
import { apiUser } from "@/lib/api";
import { buildExport } from "@/lib/export";

export const runtime = "nodejs";

/** JSON export of all travel data (no photo files). */
export async function GET() {
  const user = await apiUser();
  if (user instanceof NextResponse) return user;
  const data = await buildExport(user.id);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="travel-journal-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
