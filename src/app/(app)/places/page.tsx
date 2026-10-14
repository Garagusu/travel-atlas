import { ExternalLink, Heart, MapPin } from "lucide-react";
import Link from "next/link";
import { ShareButton } from "@/components/share-button";
import { ShareLinkButton } from "@/components/share-link-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Container, PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { PLACE_CATEGORY_LABEL } from "@/lib/constants";
import { listAllPlaces } from "@/lib/data";
import { stateName } from "@/lib/geo/states-meta";
import { CATEGORY_COLORS, mapsUrl, type PlaceCategoryKey } from "@/lib/places-util";

export const metadata = { title: "Places" };

type Cat = keyof typeof PLACE_CATEGORY_LABEL;

export default async function PlacesPage({ searchParams }: PageProps<"/places">) {
  const user = await requireUser();
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);
  const category = str(sp.category) && str(sp.category)! in PLACE_CATEGORY_LABEL ? str(sp.category) : undefined;
  const state = str(sp.state);
  const q = str(sp.q)?.slice(0, 80);
  const [list, all] = await Promise.all([listAllPlaces(user.id, { category, state, q }), listAllPlaces(user.id)]);

  const counts = new Map<string, number>();
  for (const p of all) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  const states = [...new Set(all.map((p) => p.stateCode))].sort((a, b) => stateName(a).localeCompare(stateName(b)));
  const byCity = new Map<number, typeof list>();
  for (const p of list) byCity.set(p.cityId, [...(byCity.get(p.cityId) ?? []), p]);
  const href = (patch: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ category, state, q, ...patch })) if (v) u.set(k, v);
    const s = u.toString();
    return `/places${s ? `?${s}` : ""}`;
  };
  const toShare = (p: (typeof list)[number]) => ({ ...p, categoryLabel: PLACE_CATEGORY_LABEL[p.category as Cat] });
  const filtered = category || state || q;

  return (
    <Container>
      <PageHeader
        title="Places"
        subtitle={all.length ? `${all.length} saved ${all.length === 1 ? "place" : "places"}: restaurants, museums and everything worth going back to.` : "Restaurants, museums and sights you want to remember or recommend."}
        actions={
          list.length > 0 ? (
            <>
              <ShareButton title={filtered ? "My picks" : "My favorite places"} places={list.map(toShare)} label="Share this list" className="btn btn-secondary" />
              <ShareLinkButton cityId={null} title="My favorite places" className="btn btn-secondary" />
            </>
          ) : undefined
        }
      />

      {all.length > 0 && (
        <>
          <div className="flex flex-wrap gap-1.5 mb-4">
            <Link href={href({ category: undefined })} className="chip" data-active={!category}>
              All <span className="opacity-60">{all.length}</span>
            </Link>
            {(Object.keys(PLACE_CATEGORY_LABEL) as Cat[])
              .filter((c) => counts.has(c))
              .map((c) => (
                <Link key={c} href={href({ category: c })} className="chip" data-active={category === c}>
                  <span className="h-2 w-2 rounded-full" style={{ background: CATEGORY_COLORS[c as PlaceCategoryKey] }} aria-hidden />
                  {PLACE_CATEGORY_LABEL[c]} <span className="opacity-60">{counts.get(c)}</span>
                </Link>
              ))}
          </div>
          <form noValidate action="/places" className="flex flex-wrap gap-2 mb-8" role="search">
            {category && <input type="hidden" name="category" value={category} />}
            <input type="search" name="q" defaultValue={q} placeholder="Search names, notes, addresses" className="input !w-72 max-w-full" aria-label="Search places" />
            <select name="state" defaultValue={state ?? ""} className="input !w-48" aria-label="State">
              <option value="">All states</option>
              {states.map((s) => (
                <option key={s} value={s}>{stateName(s)}</option>
              ))}
            </select>
            <button className="btn btn-secondary">Search</button>
            {filtered && <Link href="/places" className="btn btn-ghost">Reset</Link>}
          </form>
        </>
      )}

      {all.length === 0 ? (
        <EmptyState title="No saved places yet" action={<Link href="/cities" className="btn btn-primary">Go to your cities</Link>}>
          Open a city and use “Add a place” to save a restaurant, museum or sight. Search finds the address and location for you.
        </EmptyState>
      ) : list.length === 0 ? (
        <EmptyState title="Nothing matches" action={<Link href="/places" className="btn btn-secondary">Show all places</Link>} />
      ) : (
        <div className="space-y-10">
          {[...byCity.values()].map((group) => (
            <section key={group[0].cityId} aria-label={`${group[0].cityName}, ${stateName(group[0].stateCode)}`}>
              <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
                <h2 className="text-2xl">
                  <Link href={`/cities/${group[0].cityId}`} className="hover:text-pine">{group[0].cityName}</Link>
                  <span className="text-base text-ink-soft font-sans">, {stateName(group[0].stateCode)}</span>
                </h2>
                <span className="flex gap-1">
                  <ShareButton title={`My picks in ${group[0].cityName}`} places={group.map(toShare)} />
                  <ShareLinkButton cityId={group[0].cityId} title={`My picks in ${group[0].cityName}`} />
                </span>
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
