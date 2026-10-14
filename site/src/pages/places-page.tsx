import { ExternalLink, Heart, MapPin } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { ShareButton } from "@/components/share-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Container, PageHeader } from "@/components/ui/page-header";
import { PLACE_CATEGORY_LABEL } from "@/lib/constants";
import { Link, useTitle } from "@/lib/nav";
import { CATEGORY_COLORS, mapsUrl, type PlaceCategoryKey } from "@/lib/places-util";
import { stateName } from "@/lib/states-meta";
import { listAllPlaces, useStore } from "@/lib/store";

type Cat = keyof typeof PLACE_CATEGORY_LABEL;

export function PlacesPage() {
  useTitle("Places");
  const [sp, setSp] = useSearchParams();
  const category = sp.get("category") && sp.get("category")! in PLACE_CATEGORY_LABEL ? sp.get("category")! : "";
  const state = sp.get("state") ?? "";
  const q = sp.get("q") ?? "";
  const [draft, setDraft] = useState(q);
  const all = useStore(() => listAllPlaces());
  const list = useStore(() => listAllPlaces({ category: category || undefined, state: state || undefined, q: q || undefined }), [category, state, q]);
  const set = (patch: Record<string, string>) => {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) (v ? n.set(k, v) : n.delete(k));
    setSp(n, { replace: true });
  };
  const counts = new Map<string, number>();
  for (const p of all) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  const states = [...new Set(all.map((p) => p.stateCode))].sort((a, b) => stateName(a).localeCompare(stateName(b)));
  const byCity = new Map<number, typeof list>();
  for (const p of list) byCity.set(p.cityId, [...(byCity.get(p.cityId) ?? []), p]);
  const toShare = (p: (typeof list)[number]) => ({ ...p, categoryLabel: PLACE_CATEGORY_LABEL[p.category as Cat] });
  const filtered = category || state || q;

  return (
    <Container>
      <PageHeader
        title="Places"
        subtitle={all.length ? `${all.length} saved ${all.length === 1 ? "place" : "places"}: restaurants, museums and everything worth going back to.` : "Restaurants, museums and sights you want to remember or recommend."}
        actions={list.length > 0 ? <ShareButton title={filtered ? "My picks" : "My favorite places"} places={list.map(toShare)} label="Share this list" className="btn btn-secondary" /> : undefined}
      />
      {all.length > 0 && (
        <>
          <div className="flex flex-wrap gap-1.5 mb-4">
            <button onClick={() => set({ category: "" })} className="chip" data-active={!category}>
              All <span className="opacity-60">{all.length}</span>
            </button>
            {(Object.keys(PLACE_CATEGORY_LABEL) as Cat[])
              .filter((c) => counts.has(c))
              .map((c) => (
                <button key={c} onClick={() => set({ category: c })} className="chip" data-active={category === c}>
                  <span className="h-2 w-2 rounded-full" style={{ background: CATEGORY_COLORS[c as PlaceCategoryKey] }} aria-hidden />
                  {PLACE_CATEGORY_LABEL[c]} <span className="opacity-60">{counts.get(c)}</span>
                </button>
              ))}
          </div>
          <form
            noValidate
            role="search"
            className="flex flex-wrap gap-2 mb-8"
            onSubmit={(e) => {
              e.preventDefault();
              set({ q: draft.trim() });
            }}
          >
            <input type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search names, notes, addresses" className="input !w-72 max-w-full" aria-label="Search places" />
            <select value={state} onChange={(e) => set({ state: e.target.value })} className="input !w-48" aria-label="State">
              <option value="">All states</option>
              {states.map((s) => (
                <option key={s} value={s}>{stateName(s)}</option>
              ))}
            </select>
            <button className="btn btn-secondary">Search</button>
            {filtered && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setDraft("");
                  setSp(new URLSearchParams(), { replace: true });
                }}
              >
                Reset
              </button>
            )}
          </form>
        </>
      )}
      {all.length === 0 ? (
        <EmptyState title="No saved places yet" action={<Link href="/cities" className="btn btn-primary">Go to your cities</Link>}>
          Open a city and use “Add a place” to save a restaurant, museum or sight. Search finds the address and location for you.
        </EmptyState>
      ) : list.length === 0 ? (
        <EmptyState title="Nothing matches" />
      ) : (
        <div className="space-y-10">
          {[...byCity.values()].map((group) => (
            <section key={group[0].cityId} aria-label={`${group[0].cityName}, ${stateName(group[0].stateCode)}`}>
              <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
                <h2 className="text-2xl">
                  <Link href={`/cities/${group[0].cityId}`} className="hover:text-pine">{group[0].cityName}</Link>
                  <span className="text-base text-ink-soft font-sans">, {stateName(group[0].stateCode)}</span>
                </h2>
                <ShareButton title={`My picks in ${group[0].cityName}`} places={group.map(toShare)} />
              </div>
              <ul className="grid sm:grid-cols-2 gap-3">
                {group.map((p) => (
                  <li key={p.id} className="card p-4 flex flex-col">
                    <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: CATEGORY_COLORS[p.category as PlaceCategoryKey] }}>
                      <span className="h-2 w-2 rounded-full" style={{ background: CATEGORY_COLORS[p.category as PlaceCategoryKey] }} aria-hidden />
                      {PLACE_CATEGORY_LABEL[p.category as Cat]}
                      {p.favorite && <Heart size={11} className="fill-danger text-danger" aria-label="Favorite" />}
                    </p>
                    <p className="font-display text-xl leading-tight mt-1">
                      {p.url ? <a href={p.url} target="_blank" rel="noreferrer noopener" className="hover:text-pine">{p.name}</a> : p.name}
                    </p>
                    {p.address && <p className="text-xs text-ink-faint mt-0.5">{p.address}</p>}
                    {p.notes && <p className="text-sm text-ink-soft mt-2">{p.notes}</p>}
                    <div className="mt-auto pt-3 flex flex-wrap gap-1.5">
                      <a href={mapsUrl(p)} target="_blank" rel="noreferrer noopener" className="btn btn-secondary btn-sm">
                        <ExternalLink size={13} /> Open in Maps
                      </a>
                      {p.lat !== null && (
                        <Link href={`/?place=${p.id}`} className="btn btn-ghost btn-sm">
                          <MapPin size={13} /> On my map
                        </Link>
                      )}
                      <ShareButton title={`${p.name} in ${p.cityName}`} places={[toShare(p)]} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Container>
  );
}
