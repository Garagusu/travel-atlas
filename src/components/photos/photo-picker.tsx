"use client";

import { Check } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import type { PhotoItem } from "@/lib/data";
import { PhotoThumb } from "./photo-gallery";

/** Choose existing photos from the library (paged). */
export function PhotoPicker({
  open,
  onClose,
  onDone,
  exclude = [],
  title = "Choose photos",
  confirmLabel = "Add photos",
}: {
  open: boolean;
  onClose: () => void;
  onDone: (ids: string[], photos: PhotoItem[]) => void;
  exclude?: string[];
  title?: string;
  confirmLabel?: string;
}) {
  const [items, setItems] = useState<PhotoItem[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  const load = useCallback(async (before?: string | null) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/photos?limit=60${before ? `&before=${encodeURIComponent(before)}` : ""}`);
      if (!res.ok) throw new Error();
      const page: { items: PhotoItem[]; nextCursor: string | null } = await res.json();
      setItems((list) => (before ? [...list, ...page.items] : page.items));
      setCursor(page.nextCursor);
      setError(null);
    } catch {
      setError("Couldn't load your photos.");
    } finally {
      setLoading(false);
    }
  }, []);

  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setPicked([]);
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the library from the server when opened
    if (open) load(null);
  }, [open, load]);

  const ex = new Set(exclude);
  const visible = items.filter((p) => !ex.has(p.id));

  return (
    <Dialog open={open} onClose={onClose} title={title} wide>
      {error && <p className="field-error mb-3">{error}</p>}
      {!loading && visible.length === 0 && !error && <p className="text-ink-soft">No other photos in your library yet. Upload some first.</p>}
      <ul className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {visible.map((p) => {
          const on = picked.includes(p.id);
          return (
            <li key={p.id} className="relative">
              <button
                type="button"
                className={`block w-full aspect-square rounded-lg overflow-hidden ${on ? "ring-[3px] ring-pine ring-offset-2" : ""}`}
                aria-pressed={on}
                aria-label={p.caption ?? `Photo from ${p.cityName ?? "your library"}`}
                onClick={() => setPicked((l) => (on ? l.filter((x) => x !== p.id) : [...l, p.id]))}
              >
                <PhotoThumb p={p} className="w-full h-full" />
              </button>
              {on && (
                <span className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-pine text-white flex items-center justify-center pointer-events-none">
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {cursor && (
        <div className="mt-4 text-center">
          <button className="btn btn-secondary btn-sm" disabled={loading} onClick={() => load(cursor)}>{loading ? "Loading…" : "Load more"}</button>
        </div>
      )}
      <div className="sticky bottom-0 bg-card pt-4 mt-4 border-t border-line flex justify-end gap-2">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={!picked.length} onClick={() => onDone(picked, picked.map((id) => items.find((p) => p.id === id)!).filter(Boolean))}>
          {confirmLabel}{picked.length ? ` (${picked.length})` : ""}
        </button>
      </div>
    </Dialog>
  );
}
