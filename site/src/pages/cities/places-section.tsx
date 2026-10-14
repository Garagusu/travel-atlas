import { ExternalLink, Heart, Link2, MapPin, Pencil, Search, Share2, Trash2 } from "lucide-react";
import { useRouter } from "@/lib/nav";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addPlace, deletePlace, updatePlace } from "@/lib/actions";
import { MiniMap, type MiniMarker } from "@/components/map/mini-map";
import { useConfirm } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { PLACE_CATEGORY_LABEL } from "@/lib/constants";
import {
  CATEGORY_COLORS,
  isShortMapsLink,
  mapsUrl,
  parseMapsLink,
  recommendationText,
  searchOsm,
  shareText,
  type FoundPlace,
} from "@/lib/places-util";
import type { Place } from "@/lib/types";

type Category = keyof typeof PLACE_CATEGORY_LABEL;
type Draft = {
  name: string;
  category: Category;
  address: string;
  notes: string;
  url: string;
  lat: number | null;
  lon: number | null;
  favorite: boolean;
};
const empty: Draft = { name: "", category: "restaurant", address: "", notes: "", url: "", lat: null, lon: null, favorite: false };

type CityInfo = { id: number; name: string; lat: number; lon: number; stateCode: string; status: string };

export function PlacesSection({ city, places, nearby }: { city: CityInfo; places: Place[]; nearby: { lon: number; lat: number; name: string }[] }) {
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
      setDraft({
        name: p.name,
        category: p.category as Category,
        address: p.address ?? "",
        notes: p.notes ?? "",
        url: p.url ?? "",
        lat: p.lat,
        lon: p.lon,
        favorite: p.favorite,
      });
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

  const share = async (title: string, list: Place[]) => {
    const text = recommendationText(
      title,
      list.map((p) => ({ ...p, categoryLabel: PLACE_CATEGORY_LABEL[p.category as Category], cityName: city.name, stateCode: city.stateCode })),
    );
    try {
      const r = await shareText(title, text);
      if (r === "copied") toast("Copied — paste it into a message");
    } catch {
      toast("Couldn't share or copy on this device", "error");
    }
  };

  const grouped = useMemo(() => {
    const g = new Map<string, Place[]>();
    for (const p of places) g.set(p.category, [...(g.get(p.category) ?? []), p]);
    return [...g.entries()];
  }, [places]);

  return (
    <section aria-labelledby="places-h">
      <div className="flex items-end justify-between gap-2 mb-3">
        <h2 id="places-h" className="text-2xl">Favorite places</h2>
        <div className="flex gap-1.5">
          {places.length > 0 && !editing && (
            <button className="btn btn-ghost btn-sm" onClick={() => share(`My picks in ${city.name}`, places)} aria-label={`Share my picks in ${city.name}`}>
              <Share2 size={14} /> Share
            </button>
          )}
          {!editing && <button className="btn btn-secondary btn-sm" onClick={() => open()}>Add a place</button>}
        </div>
      </div>

      <MiniMap
        markers={markers}
        nearby={nearbyMemo}
        highlightState={city.stateCode}
        zoom={places.some((p) => p.lat !== null) ? 13 : 9}
        height={260}
        onPick={editing ? (pt) => setDraft((d) => ({ ...d, lat: Math.round(pt.lat * 1e5) / 1e5, lon: Math.round(pt.lon * 1e5) / 1e5 })) : undefined}
        pickLabel="Or click the map to pin it"
      />

      {editing && (
        <form
          noValidate
          className="card p-4 mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {editing === "new" && (
            <PlaceFinder
              city={city}
              onPick={(f) =>
                setDraft((d) => ({ ...d, name: f.name, address: f.address ?? "", lat: f.lat, lon: f.lon, category: f.category as Category }))
              }
            />
          )}
          <div>
            <label className="label" htmlFor="pl-name">Name</label>
            <input id="pl-name" className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-invalid={!!errors.name} />
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
            <label className="label" htmlFor="pl-address">Address</label>
            <input id="pl-address" className="input" placeholder="Street, city" value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="pl-notes">Notes</label>
            <textarea id="pl-notes" className="input min-h-20" placeholder="What to order, best time to go, who to ask for…" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </div>
          <MapsLinkField
            onCoords={(c) => setDraft((d) => ({ ...d, lat: c.lat, lon: c.lon, name: d.name || c.name || "" }))}
          />
          <div>
            <label className="label" htmlFor="pl-url">Website or reservation link</label>
            <input id="pl-url" className="input" placeholder="https://" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} aria-invalid={!!errors.url} />
            {errors.url && <p className="field-error">{errors.url}</p>}
          </div>
          <p className="text-xs text-ink-soft flex items-center gap-1.5">
            <MapPin size={13} aria-hidden />
            {draft.lat !== null ? (
              <>
                Location set ({draft.lat.toFixed(4)}, {draft.lon!.toFixed(4)}).{" "}
                <button type="button" className="underline" onClick={() => setDraft({ ...draft, lat: null, lon: null })}>Clear</button>
              </>
            ) : (
              "No location yet: search above, paste a map link, or click the map."
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
        <p className="text-sm text-ink-soft mt-4">Save restaurants, museums and sights you loved, or want to try, in {city.name}. You can share them later as a list.</p>
      ) : (
        <div className="mt-5 space-y-5">
          {grouped.map(([cat, list]) => (
            <div key={cat}>
              <p className="text-sm font-semibold text-ink-soft mb-1.5 flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORY_COLORS[cat as Category] }} aria-hidden />
                {PLACE_CATEGORY_LABEL[cat as Category]}
              </p>
              <ul className="space-y-2">
                {list.map((p) => (
                  <li key={p.id} className="group flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium flex items-center gap-1.5">
                        {p.url ? (
                          <a href={p.url} target="_blank" rel="noreferrer noopener" className="hover:text-pine underline-offset-2 hover:underline">{p.name}</a>
                        ) : (
                          p.name
                        )}
                        {p.favorite && <Heart size={13} className="fill-danger text-danger shrink-0" aria-label="Favorite" />}
                      </p>
                      {p.address && <p className="text-xs text-ink-faint">{p.address}</p>}
                      {p.notes && <p className="text-sm text-ink-soft">{p.notes}</p>}
                      <a
                        href={mapsUrl({ ...p, cityName: city.name, stateCode: city.stateCode })}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 text-xs text-pine hover:underline underline-offset-2 mt-0.5"
                      >
                        <ExternalLink size={11} aria-hidden /> Open in Maps
                      </a>
                    </div>
                    <button className="btn btn-ghost btn-icon !h-7 !w-7 opacity-60 group-hover:opacity-100" aria-label={`Share ${p.name}`} onClick={() => share(`${p.name} in ${city.name}`, [p])}>
                      <Share2 size={13} />
                    </button>
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

/** Search OpenStreetMap for the place by name, near the city. */
function PlaceFinder({ city, onPick }: { city: CityInfo; onPick: (f: FoundPlace) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoundPlace[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const run = async () => {
    if (q.trim().length < 3) return;
    abort.current?.abort();
    abort.current = new AbortController();
    setState("loading");
    try {
      setResults(await searchOsm(`${q} ${city.name}`, { lat: city.lat, lon: city.lon }, abort.current.signal));
      setState("idle");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setState("error");
    }
  };

  return (
    <div className="rounded-xl bg-fog/60 p-3">
      <label className="label" htmlFor="pl-find">Find the place</label>
      <div className="flex gap-2">
        <input
          id="pl-find"
          className="input"
          placeholder={`e.g. Neptune Oyster, MoMA…`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void run();
            }
          }}
          autoFocus
        />
        <button type="button" className="btn btn-secondary shrink-0" onClick={run} disabled={q.trim().length < 3 || state === "loading"}>
          <Search size={14} /> {state === "loading" ? "Searching…" : "Search"}
        </button>
      </div>
      {state === "error" && <p className="field-error">Place search isn&apos;t responding. Fill in the details by hand, or paste a map link.</p>}
      {results && results.length === 0 && state === "idle" && <p className="text-sm text-ink-soft mt-2">No match. Try a shorter name, or paste a Google Maps link below.</p>}
      {results && results.length > 0 && (
        <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-card max-h-56 overflow-y-auto" aria-label="Search results">
          {results.map((r, i) => (
            <li key={`${r.lat},${r.lon},${i}`}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-fog"
                onClick={() => {
                  onPick(r);
                  setResults(null);
                  setQ("");
                }}
              >
                <span className="font-medium">{r.name}</span> <span className="text-xs text-ink-faint">{r.kind}</span>
                {r.address && <span className="block text-xs text-ink-soft">{r.address}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-ink-faint mt-1.5">Search by OpenStreetMap.</p>
    </div>
  );
}

/** Paste a Google or Apple Maps link to set the location. */
function MapsLinkField({ onCoords }: { onCoords: (c: { lat: number; lon: number; name?: string }) => void }) {
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const read = (v: string) => {
    if (!v.trim()) return setMsg(null);
    const c = parseMapsLink(v);
    if (c) {
      onCoords(c);
      setMsg({ tone: "ok", text: "Location taken from the link." });
    } else if (isShortMapsLink(v)) {
      setMsg({ tone: "error", text: "Short links can't be read. Open it, then copy the full address from the browser bar." });
    } else {
      setMsg({ tone: "error", text: "No location found in that link." });
    }
  };
  return (
    <div>
      <label className="label" htmlFor="pl-link">
        <Link2 size={12} className="inline -mt-0.5 mr-1" aria-hidden />
        Google Maps link (optional)
      </label>
      <input
        id="pl-link"
        className="input"
        placeholder="Paste a google.com/maps/… link"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          read(e.target.value);
        }}
      />
      {msg && <p className={`text-xs mt-1 ${msg.tone === "ok" ? "text-pine" : "text-danger"}`}>{msg.text}</p>}
    </div>
  );
}
