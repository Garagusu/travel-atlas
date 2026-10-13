import { useRouter } from "@/lib/nav";
import { useEffect, useRef, useState, useTransition } from "react";
import { createAlbum, updateAlbum } from "@/lib/actions";
import { PhotoGallery } from "@/components/photos/photo-gallery";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { allPhotos, useStore } from "@/lib/store";

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

/** The whole photo library, rendered in growing pages so large libraries stay fast. */
export function Library({ albums, trips }: { albums: Option[]; trips: Option[] }) {
  const all = useStore(allPhotos);
  const [shown, setShown] = useState(60);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && setShown((n) => n + 60), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div>
      <PhotoGallery photos={all.slice(0, shown)} upload={{}} albums={albums} trips={trips} columns="grid-cols-2 sm:grid-cols-4 lg:grid-cols-6" emptyText="No photos yet." />
      <div ref={sentinel} className="h-8" />
    </div>
  );
}
