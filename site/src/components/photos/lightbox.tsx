import { ChevronLeft, ChevronRight, Download, Pencil, X } from "lucide-react";
import { Link } from "@/lib/nav";
import { useEffect, useRef, useState, useTransition } from "react";
import { updatePhoto } from "@/lib/actions";
import { formatDate } from "@/components/ui/format";
import { useToast } from "@/components/ui/toast";
import { getBlob } from "@/lib/store";
import { openOriginal, usePhotoUrl } from "./photo-img";
import type { PhotoItem } from "@/lib/types";
import { PhotoLocation } from "./photo-location";

/** Full-size viewer with captions, keyboard and swipe navigation, and inline editing. */
export function Lightbox({
  photos,
  index,
  onIndex,
  onClose,
  onChanged,
  extraActions,
}: {
  photos: PhotoItem[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  onChanged?: (p: PhotoItem) => void;
  extraActions?: (p: PhotoItem) => React.ReactNode;
}) {
  // edits made in the viewer show at once, even where the parent doesn't pass them back
  const [patched, setPatched] = useState<Record<string, PhotoItem>>({});
  const p = photos[index] ? (patched[photos[index].id] ?? photos[index]) : undefined;
  const changed = (np: PhotoItem) => {
    setPatched((m) => ({ ...m, [np.id]: np }));
    onChanged?.(np);
  };
  const displayUrl = usePhotoUrl(p?.id, "display");
  const [editing, setEditing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const touchX = useRef<number | null>(null);
  const dialog = useRef<HTMLDivElement>(null);

  const [seenIndex, setSeenIndex] = useState(index);
  if (seenIndex !== index) {
    setSeenIndex(index);
    setLoaded(false);
    setEditing(false);
  }

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea")) return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && index < photos.length - 1) onIndex(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, photos.length, onClose, onIndex]);

  // Preload neighbours so arrowing through feels instant.
  useEffect(() => {
    for (const i of [index - 1, index + 1]) {
      const n = photos[i];
      if (n) void getBlob(n.id, "display");
    }
  }, [index, photos]);

  if (!p) return null;

  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label={p.caption ?? "Photo viewer"}
      tabIndex={-1}
      className="fixed inset-0 z-[90] bg-[#f4f1ea]/[.98] flex flex-col lg:flex-row outline-none"
    >
      <div
        className="relative flex-1 min-h-0 flex items-center justify-center p-4 sm:p-8 select-none"
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (dx < -50 && index < photos.length - 1) onIndex(index + 1);
          if (dx > 50 && index > 0) onIndex(index - 1);
          touchX.current = null;
        }}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <img
          key={p.id}
          src={displayUrl ?? undefined}
          alt={p.caption ?? p.description ?? "Travel photo"}
          className={`max-w-full max-h-full object-contain rounded-lg shadow-[var(--shadow-lift)] transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"}`}
          style={{ aspectRatio: `${p.width} / ${p.height}`, background: p.dominantColor ?? "#ddd" }}
          onLoad={() => setLoaded(true)}
        />
        {index > 0 && (
          <button className="absolute left-3 top-1/2 -translate-y-1/2 btn btn-secondary btn-icon shadow-[var(--shadow-soft)]" aria-label="Previous photo" onClick={() => onIndex(index - 1)}>
            <ChevronLeft size={20} />
          </button>
        )}
        {index < photos.length - 1 && (
          <button className="absolute right-3 top-1/2 -translate-y-1/2 btn btn-secondary btn-icon shadow-[var(--shadow-soft)]" aria-label="Next photo" onClick={() => onIndex(index + 1)}>
            <ChevronRight size={20} />
          </button>
        )}
        <button className="absolute top-3 right-3 btn btn-secondary btn-icon lg:hidden" aria-label="Close viewer" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <aside className="lg:w-[340px] shrink-0 bg-card border-t lg:border-t-0 lg:border-l border-line p-5 overflow-y-auto max-h-[40vh] lg:max-h-none">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-ink-faint">
            {index + 1} of {photos.length}
          </span>
          <button className="btn btn-ghost btn-icon hidden lg:inline-flex" aria-label="Close viewer" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {editing ? (
          <PhotoEditForm photo={p} onDone={(np) => { setEditing(false); if (np) changed(np); }} />
        ) : (
          <>
            <p className="font-display text-2xl leading-snug">{p.caption ?? <span className="text-ink-faint">No caption</span>}</p>
            <p className="text-sm text-ink-soft mt-1">
              {[p.takenOn && formatDate(p.takenOn), p.cityName && `${p.cityName}${p.stateCode ? `, ${p.stateCode}` : ""}`].filter(Boolean).join(", ")}
            </p>
            {p.description && <p className="mt-4 whitespace-pre-line leading-relaxed">{p.description}</p>}
            <div className="mt-5 flex flex-wrap gap-2">
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
                <Pencil size={14} /> Edit details
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => openOriginal(p.id, p.originalName)}>
                <Download size={14} /> Original
              </button>
              {p.cityId && (
                <Link className="btn btn-ghost btn-sm" href={`/cities/${p.cityId}`}>
                  City page
                </Link>
              )}
            </div>
            {extraActions && <div className="mt-2 flex flex-wrap gap-2">{extraActions(p)}</div>}
            <PhotoLocation photo={p} onChanged={changed} />
          </>
        )}
      </aside>
    </div>
  );
}

export function PhotoEditForm({ photo, onDone }: { photo: PhotoItem; onDone: (p?: PhotoItem) => void }) {
  const [caption, setCaption] = useState(photo.caption ?? "");
  const [description, setDescription] = useState(photo.description ?? "");
  const [takenOn, setTakenOn] = useState(photo.takenOn ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <form noValidate
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await updatePhoto(photo.id, { caption, description, takenOn });
          if (!res.ok) return setError(res.error);
          toast("Photo details saved");
          onDone({ ...photo, caption: caption.trim() || null, description: description.trim() || null, takenOn: takenOn || null });
        });
      }}
    >
      <div>
        <label className="label" htmlFor="ph-caption">Caption</label>
        <input id="ph-caption" className="input" value={caption} maxLength={200} onChange={(e) => setCaption(e.target.value)} autoFocus />
      </div>
      <div>
        <label className="label" htmlFor="ph-date">Date taken</label>
        <input id="ph-date" type="date" className="input" value={takenOn} onChange={(e) => setTakenOn(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="ph-desc">Description</label>
        <textarea id="ph-desc" className="input min-h-28" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      {error && <p className="field-error">{error}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Saving…" : "Save details"}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDone()}>Cancel</button>
      </div>
    </form>
  );
}
