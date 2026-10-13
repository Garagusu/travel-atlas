import { Check } from "lucide-react";
import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { allPhotos, useStore } from "@/lib/store";
import type { PhotoItem } from "@/lib/types";
import { PhotoThumb } from "./photo-gallery";

const PAGE = 60;

/** Choose existing photos from the library. */
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
  const items = useStore(allPhotos);
  const [shown, setShown] = useState(PAGE);
  const [picked, setPicked] = useState<string[]>([]);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setPicked([]);
      setShown(PAGE);
    }
  }
  const ex = new Set(exclude);
  const available = items.filter((p) => !ex.has(p.id));
  const visible = available.slice(0, shown);

  return (
    <Dialog open={open} onClose={onClose} title={title} wide>
      {available.length === 0 && <p className="text-ink-soft">No other photos in your library yet. Add some first.</p>}
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
      {available.length > shown && (
        <div className="mt-4 text-center">
          <button className="btn btn-secondary btn-sm" onClick={() => setShown((n) => n + PAGE)}>Show more</button>
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
