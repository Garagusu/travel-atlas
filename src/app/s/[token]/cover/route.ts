import { getSharedList } from "@/lib/data";
import { db } from "@/db";
import { photos } from "@/db/schema";
import { eq } from "drizzle-orm";
import { extForMime, variantKey } from "@/lib/images";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

/** The city's cover photo for a public share page (and nothing else). */
export async function GET(_req: Request, ctx: RouteContext<"/s/[token]/cover">) {
  const { token } = await ctx.params;
  const shared = await getSharedList(token);
  if (!shared?.coverId) return new Response("Not found", { status: 404 });
  const [p] = await db.select().from(photos).where(eq(photos.id, shared.coverId)).limit(1);
  if (!p) return new Response("Not found", { status: 404 });
  const obj = await storage().get(variantKey(p.storageKey, "display", extForMime(p.mimeType)));
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(obj.body, { headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=3600" } });
}
