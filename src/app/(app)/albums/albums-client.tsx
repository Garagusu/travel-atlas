"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createAlbum, updateAlbum } from "@/app/actions/photos";
import { PhotoGallery } from "@/components/photos/photo-gallery";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import type { PhotoItem } from "@/lib/data";

type Option = { id: string; title: string };

export function AlbumFormDialog({
  open,
  onClose,
  trips,
  album,
}: {
  open: boolean;
  onClose: () => void;
  trips: Option[];
  album?: { id: string; title: string; description: string | null; tripId: string | null };
}) {
  const [v, setV] = useState({ title: album?.title ?? "", description: album?.description ?? "", tripId: album?.tripId ?? "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <Dialog open={open} onClose={onClose} title={album ? "Edit album" : "New album"}>
      <form noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            if (album) {
              const res = await updateAlbum(album.id, v);
              if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
              toast("Album saved");
              onClose();
              router.refresh();
            } else {
              const res = await createAlbum(v);
              if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
              toast(`${v.title} created`);
              router.push(`/albums/${res.data.id}`);
            }
          });
        }}
      >
        <div>
          <label className="label" htmlFor="al-title">Title</label>
          <input id="al-title" className="input" placeholder="California Road Trip" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} aria-invalid={!!errors.title} autoFocus />
          {errors.title && <p className="field-error">{errors.title}</p>}
        </div>
        <div>
          <label className="label" htmlFor="al-desc">Description</label>
          <textarea id="al-desc" className="input min-h-20" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="al-trip">Trip</label>
          <select id="al-trip" className="input" value={v.tripId} onChange={(e) => setV({ ...v, tripId: e.target.value })}>
            <option value="">Not linked to a trip</option>
            {trips.map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
        </div>
        {errors.form && <p className="field-error">{errors.form}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : album ? "Save album" : "Create album"}</button>
        </div>
      </form>
    </Dialog>
  );
}

export function AlbumFormButton({ trips }: { trips: Option[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>New album</button>
      {open && <AlbumFormDialog open onClose={() => setOpen(false)} trips={trips} />}
    </>
  );
}

/** Infinite photo library built on the gallery (select, add to album, delete…). */
export function Library({ initial, initialCursor, albums, trips }: { initial: PhotoItem[]; initialCursor: string | null; albums: Option[]; trips: Option[] }) {
  const [extra, setExtra] = useState<PhotoItem[]>([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  // when the first page changes (upload/delete), reset paging
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setExtra([]);
    setCursor(initialCursor);
  }

  const loadMore = async () => {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/photos?limit=60&before=${encodeURIComponent(cursor)}`);
      if (!res.ok) throw new Error();
      const page: { items: PhotoItem[]; nextCursor: string | null } = await res.json();
      setExtra((l) => [...l, ...page.items]);
      setCursor(page.nextCursor);
      setError(null);
    } catch {
      setError("Couldn't load more photos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && loadMore(), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  });

  const all = [...initial, ...extra.filter((p) => !initial.some((i) => i.id === p.id))];
  return (
    <div>
      <PhotoGallery photos={all} upload={{}} albums={albums} trips={trips} columns="grid-cols-2 sm:grid-cols-4 lg:grid-cols-6" emptyText="No photos yet." />
      <div ref={sentinel} className="h-8" />
      {error && <p className="field-error text-center">{error}</p>}
      {cursor && (
        <div className="text-center">
          <button className="btn btn-secondary btn-sm" disabled={loading} onClick={loadMore}>{loading ? "Loading…" : "Load more"}</button>
        </div>
      )}
    </div>
  );
}
