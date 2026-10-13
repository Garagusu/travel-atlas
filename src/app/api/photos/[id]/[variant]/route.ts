import { NextResponse } from "next/server";
import { apiUser, jsonError } from "@/lib/api";
import { getPhoto } from "@/lib/data";
import { extForMime, PHOTO_VARIANTS, variantKey, type PhotoVariant } from "@/lib/images";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

/** Streams a photo variant. Only the owner can read it. */
export async function GET(req: Request, ctx: RouteContext<"/api/photos/[id]/[variant]">) {
  const user = await apiUser();
  if (user instanceof NextResponse) return user;
  const { id, variant } = await ctx.params;
  if (!PHOTO_VARIANTS.includes(variant as PhotoVariant)) return jsonError(404, "Unknown size");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError(404, "Photo not found");
  const photo = await getPhoto(user.id, id);
  if (!photo) return jsonError(404, "Photo not found");

  const etag = `"${photo.id}-${variant}"`;
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag } });

  const obj = await storage().get(variantKey(photo.storageKey, variant as PhotoVariant, extForMime(photo.mimeType)));
  if (!obj) return jsonError(404, "Photo file is missing from storage");

  const headers: Record<string, string> = {
    "Content-Type": variant === "original" ? photo.mimeType : "image/webp",
    "Cache-Control": "private, max-age=31536000, immutable",
    ETag: etag,
  };
  if (obj.size) headers["Content-Length"] = String(obj.size);
  if (variant === "original") {
    const name = (photo.originalName ?? `photo.${extForMime(photo.mimeType)}`).replace(/[^\w.\- ]+/g, "_");
    headers["Content-Disposition"] = `inline; filename="${name}"`;
  }
  return new Response(obj.body, { headers });
}
