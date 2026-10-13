import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { getBlob } from "@/lib/store";
import type { PhotoVariant } from "@/lib/types";

const cache = new Map<string, string>();

/** Object URL for a stored photo variant (loaded from IndexedDB once, then cached). */
export function usePhotoUrl(id: string | null | undefined, variant: PhotoVariant = "thumb") {
  const key = id ? `${id}/${variant}` : "";
  const [url, setUrl] = useState<string | null>(() => (key ? cache.get(key) ?? null : null));
  useEffect(() => {
    if (!id) return;
    const hit = cache.get(key);
    if (hit) {
      setUrl(hit);
      return;
    }
    let alive = true;
    getBlob(id, variant).then((b) => {
      if (!b || !alive) return;
      const u = URL.createObjectURL(b);
      cache.set(key, u);
      setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [id, variant, key]);
  return url;
}

export function PhotoImg({
  id,
  variant = "thumb",
  bg,
  ...img
}: { id: string; variant?: PhotoVariant; bg?: string | null } & Omit<ImgHTMLAttributes<HTMLImageElement>, "src">) {
  const url = usePhotoUrl(id, variant);
  if (!url) return <span className={img.className} style={{ display: "block", background: bg ?? "var(--color-fog)", ...img.style }} aria-hidden />;
  return <img {...img} src={url} style={{ background: bg ?? undefined, ...img.style }} />;
}

/** Opens the original file in a new tab (used for "download original"). */
export async function openOriginal(id: string, name?: string | null) {
  const b = await getBlob(id, "original");
  if (!b) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b);
  a.download = name ?? `photo-${id}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
