"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createAlbum, updateAlbum } from "@/app/actions/photos";
import { PhotoFilterBar } from "@/components/photos/photo-filter-bar";
import { PhotoGallery } from "@/components/photos/photo-gallery";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import type { PhotoFacet, PhotoItem } from "@/lib/data";

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

/** Infinite photo library built on the gallery (select, add to album, delete…), filterable by year and city. */
export function Library({
  initial,
  initialCursor,
  facets,
  albums,
  trips,
}: {
  initial: PhotoItem[];
  initialCursor: string | null;
  facets: PhotoFacet[];
  albums: Option[];
  trips: Option[];
}) {
  const [filter, setFilter] = useState<Filter>({ year: null, cityId: null });
  const active = filter.year !== null || filter.cityId !== null;
  // filtered first page comes from the API; the unfiltered one from the server render
  const [first, setFirst] = useState<{ items: PhotoItem[]; cursor: string | null } | null>(null);
  const [extra, setExtra] = useState<PhotoItem[]>([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

  // when the first page changes (upload/delete), reset paging
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    if (!active) {
      setExtra([]);
      setCursor(initialCursor);
    }
  }

  const query = (f: Filter, before?: string | null) => {
    const q = new URLSearchParams({ limit: "60" });
    if (before) q.set("before", before);
    if (f.year !== null) q.set("year", String(f.year));
    if (f.cityId !== null) q.set("cityId", String(f.cityId));
    return `/api/photos?${q}`;
  };

  const change = async (f: Filter) => {
    setFilter(f);
    setExtra([]);
    setError(null);
    const id = ++reqId.current;
    if (f.year === null && f.cityId === null) {
      setFirst(null);
      setCursor(initialCursor);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(query(f));
      if (!res.ok) throw new Error();
      const page: { items: PhotoItem[]; nextCursor: string | null } = await res.json();
      if (id !== reqId.current) return;
      setFirst({ items: page.items, cursor: page.nextCursor });
      setCursor(page.nextCursor);
    } catch {
      if (id === reqId.current) setError("Couldn't load these photos. Try again.");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!cursor || loading) return;
    const id = reqId.current;
    setLoading(true);
    try {
      const res = await fetch(query(filter, cursor));
      if (!res.ok) throw new Error();
      const page: { items: PhotoItem[]; nextCursor: string | null } = await res.json();
      if (id !== reqId.current) return;
      setExtra((l) => [...l, ...page.items]);
      setCursor(page.nextCursor);
      setError(null);
    } catch {
      if (id === reqId.current) setError("Couldn't load more photos.");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  };

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && loadMore(), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  });

  const options = useMemo(() => facetOptions(facets, filter), [facets, filter]);
  const total = useMemo(
    () => facets.filter((f) => (filter.year === null || f.year === filter.year) && (filter.cityId === null || f.cityId === filter.cityId)).reduce((n, f) => n + f.count, 0),
    [facets, filter],
  );
  const cityFacet = filter.cityId === null ? null : facets.find((f) => f.cityId === filter.cityId);

  const base = active ? first?.items ?? [] : initial;
  const all = [...base, ...extra.filter((p) => !base.some((i) => i.id === p.id))];
  return (
    <div>
      {facets.length > 0 && (
        <PhotoFilterBar filter={filter} years={options.years} cities={options.cities} cityLabel={cityFacet?.cityName ?? null} total={total} onChange={change} />
      )}
      {active && !first && loading ? (
        <p className="text-sm text-ink-soft py-8 text-center">Loading photos…</p>
      ) : active && first && all.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong py-10 text-center text-sm text-ink-soft">
          No photos match this year and city.{" "}
          <button className="text-pine hover:underline underline-offset-2" onClick={() => change({ year: null, cityId: null })}>Show all photos</button>
        </div>
      ) : (
        <PhotoGallery photos={all} upload={active ? undefined : {}} albums={albums} trips={trips} columns="grid-cols-2 sm:grid-cols-4 lg:grid-cols-6" emptyText="No photos yet." />
      )}
      <div ref={sentinel} className="h-8" />
      {error && <p className="field-error text-center">{error}</p>}
      {cursor && (!active || first) && (
        <div className="text-center">
          <button className="btn btn-secondary btn-sm" disabled={loading} onClick={loadMore}>{loading ? "Loading…" : "Load more"}</button>
        </div>
      )}
    </div>
  );
}

type Filter = { year: number | null; cityId: number | null };

/** Dropdown choices, each narrowed by the other selection (pick 2023 → only cities with 2023 photos). */
function facetOptions(facets: PhotoFacet[], f: Filter) {
  const years = new Map<number, number>();
  const cities = new Map<number, { cityId: number; label: string; count: number }>();
  for (const x of facets) {
    if (f.cityId === null || x.cityId === f.cityId) years.set(x.year, (years.get(x.year) ?? 0) + x.count);
    if (x.cityId !== null && (f.year === null || x.year === f.year)) {
      const c = cities.get(x.cityId);
      if (c) c.count += x.count;
      else cities.set(x.cityId, { cityId: x.cityId, label: x.stateCode ? `${x.cityName}, ${x.stateCode}` : x.cityName ?? "Unknown city", count: x.count });
    }
  }
  return {
    years: [...years].map(([year, count]) => ({ year, count })).sort((a, b) => b.year - a.year),
    cities: [...cities.values()].sort((a, b) => a.label.localeCompare(b.label)),
  };
}
