"use client";

import { Heart, MapPin, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { addPlace, deletePlace, updatePlace } from "@/app/actions/cities";
import { MiniMap, type MiniMarker } from "@/components/map/mini-map";
import { useConfirm } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { PLACE_CATEGORY_LABEL } from "@/lib/constants";
import type { Place } from "@/db/schema";

type Category = keyof typeof PLACE_CATEGORY_LABEL;
type Draft = { name: string; category: Category; notes: string; url: string; lat: number | null; lon: number | null; favorite: boolean };
const empty: Draft = { name: "", category: "restaurant", notes: "", url: "", lat: null, lon: null, favorite: false };

export function PlacesSection({
  city,
  places,
  nearby,
}: {
  city: { id: number; name: string; lat: number; lon: number; stateCode: string; status: string };
  places: Place[];
  nearby: { lon: number; lat: number; name: string }[];
}) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();

  const markers = useMemo<MiniMarker[]>(() => {
    const m: MiniMarker[] = [
      { id: "city", lon: city.lon, lat: city.lat, label: city.name, kind: "city", status: city.status === "visited" ? 2 : city.status === "want_to_visit" ? 1 : 0 },
    ];
    for (const p of places) if (p.lat !== null && p.lon !== null && p.id !== editing) m.push({ id: p.id, lon: p.lon, lat: p.lat, label: p.name, kind: "place" });
    if (editing && draft.lat !== null && draft.lon !== null) m.push({ id: "draft", lon: draft.lon, lat: draft.lat, label: draft.name || "New place", kind: "place" });
    return m;
  }, [city, places, editing, draft.lat, draft.lon, draft.name]);

  const nearbyMemo = useMemo(() => nearby, [nearby]);

  const open = (p?: Place) => {
    setErrors({});
    if (p) {
      setEditing(p.id);
      setDraft({ name: p.name, category: p.category as Category, notes: p.notes ?? "", url: p.url ?? "", lat: p.lat, lon: p.lon, favorite: p.favorite });
    } else {
      setEditing("new");
      setDraft(empty);
    }
  };

  const save = () =>
    start(async () => {
      const res = editing === "new" ? await addPlace(city.id, draft) : await updatePlace(editing!, draft);
      if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
      toast(editing === "new" ? `${draft.name} saved` : "Place updated");
      setEditing(null);
      router.refresh();
    });

  const grouped = useMemo(() => {
    const g = new Map<string, Place[]>();
    for (const p of places) g.set(p.category, [...(g.get(p.category) ?? []), p]);
    return [...g.entries()];
  }, [places]);

  return (
    <section aria-labelledby="places-h">
      <div className="flex items-end justify-between mb-3">
        <h2 id="places-h" className="text-2xl">Favorite places</h2>
        {!editing && <button className="btn btn-secondary btn-sm" onClick={() => open()}>Add a place</button>}
      </div>

      <MiniMap
        markers={markers}
        nearby={nearbyMemo}
        highlightState={city.stateCode}
        zoom={places.some((p) => p.lat !== null) ? 13 : 9}
        height={260}
        onPick={editing ? (pt) => setDraft((d) => ({ ...d, lat: Math.round(pt.lat * 1e5) / 1e5, lon: Math.round(pt.lon * 1e5) / 1e5 })) : undefined}
        pickLabel="Click the map to place it"
      />

      {editing && (
        <form noValidate
          className="card p-4 mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div>
            <label className="label" htmlFor="pl-name">Name</label>
            <input id="pl-name" className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus aria-invalid={!!errors.name} />
            {errors.name && <p className="field-error">{errors.name}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="pl-cat">Kind</label>
              <select id="pl-cat" className="input" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as Category })}>
                {Object.entries(PLACE_CATEGORY_LABEL).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input type="checkbox" checked={draft.favorite} onChange={(e) => setDraft({ ...draft, favorite: e.target.checked })} className="h-4 w-4 accent-[var(--color-pine)]" />
              A favorite
            </label>
          </div>
          <div>
            <label className="label" htmlFor="pl-notes">Notes</label>
            <textarea id="pl-notes" className="input min-h-20" placeholder="What to order, best time to go…" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="pl-url">Link</label>
            <input id="pl-url" className="input" placeholder="https://" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} aria-invalid={!!errors.url} />
            {errors.url && <p className="field-error">{errors.url}</p>}
          </div>
          <p className="text-xs text-ink-soft flex items-center gap-1.5">
            <MapPin size={13} aria-hidden />
            {draft.lat !== null ? (
              <>
                Pinned at {draft.lat.toFixed(4)}, {draft.lon!.toFixed(4)}.{" "}
                <button type="button" className="underline" onClick={() => setDraft({ ...draft, lat: null, lon: null })}>Remove pin</button>
              </>
            ) : (
              "Optional: click the map above to pin its location."
            )}
          </p>
          {errors.form && <p className="field-error">{errors.form}</p>}
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Saving…" : editing === "new" ? "Save place" : "Save changes"}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}

      {places.length === 0 && !editing ? (
        <p className="text-sm text-ink-soft mt-4">Save restaurants, sights and activities you loved, or want to try, in {city.name}.</p>
      ) : (
        <div className="mt-5 space-y-5">
          {grouped.map(([cat, list]) => (
            <div key={cat}>
              <p className="text-sm font-semibold text-ink-soft mb-1.5">{PLACE_CATEGORY_LABEL[cat as Category]}</p>
              <ul className="space-y-1.5">
                {list.map((p) => (
                  <li key={p.id} className="group flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium flex items-center gap-1.5">
                        {p.url ? <a href={p.url} target="_blank" rel="noreferrer noopener" className="hover:text-pine underline-offset-2 hover:underline">{p.name}</a> : p.name}
                        {p.favorite && <Heart size={13} className="fill-danger text-danger shrink-0" aria-label="Favorite" />}
                      </p>
                      {p.notes && <p className="text-sm text-ink-soft">{p.notes}</p>}
                    </div>
                    <button className="btn btn-ghost btn-icon !h-7 !w-7 opacity-60 group-hover:opacity-100" aria-label={`Edit ${p.name}`} onClick={() => open(p)}>
                      <Pencil size={13} />
                    </button>
                    <button
                      className="btn btn-ghost btn-icon !h-7 !w-7 opacity-60 group-hover:opacity-100"
                      aria-label={`Delete ${p.name}`}
                      onClick={async () => {
                        if (!(await confirm({ title: `Delete ${p.name}?`, message: "This saved place will be removed.", confirmLabel: "Delete", danger: true }))) return;
                        start(async () => {
                          const res = await deletePlace(p.id);
                          if (!res.ok) return toast(res.error, "error");
                          toast(`${p.name} deleted`);
                          router.refresh();
                        });
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
