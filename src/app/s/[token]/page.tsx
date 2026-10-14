import { ExternalLink, Heart } from "lucide-react";
import type { Metadata } from "next";
import { SharedMap } from "@/components/shared-map";
import { StarRating } from "@/components/ui/star-rating";
import { PLACE_CATEGORY_LABEL } from "@/lib/constants";
import { getSharedList } from "@/lib/data";
import { stateName } from "@/lib/geo/states-meta";
import { CATEGORY_COLORS, mapsUrl, type PlaceCategoryKey } from "@/lib/places-util";

type Cat = keyof typeof PLACE_CATEGORY_LABEL;

export async function generateMetadata({ params }: PageProps<"/s/[token]">): Promise<Metadata> {
  const shared = await getSharedList((await params).token);
  if (!shared) return { title: "Link no longer shared", robots: { index: false } };
  const title = shared.city ? `${shared.ownerFirstName}’s picks in ${shared.city.name}` : `${shared.ownerFirstName}’s favorite places`;
  return { title, description: `${shared.places.length} recommended places`, robots: { index: false, follow: false } };
}

/** Public, read-only recommendations page. No sign-in; shows only places and notes. */
export default async function SharedPage({ params }: PageProps<"/s/[token]">) {
  const shared = await getSharedList((await params).token);
  if (!shared) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 py-24 text-center">
        <div>
          <h1 className="text-3xl mb-2">This list isn&apos;t shared anymore</h1>
          <p className="text-ink-soft">The person who sent it turned the link off.</p>
        </div>
      </main>
    );
  }
  const { city, places, ownerFirstName } = shared;
  const groups = new Map<string, typeof places>();
  for (const p of places) {
    const key = city ? p.category : `${p.cityName}|${p.stateCode}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const markers = places
    .filter((p) => p.lat !== null && p.lon !== null)
    .map((p) => ({ id: p.id, lat: p.lat!, lon: p.lon!, label: p.name, kind: "place" as const }));

  return (
    <main className="flex-1">
      {shared.coverId && (
        <div className="relative h-[32vh] min-h-52 max-h-[380px] bg-fog">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/s/${shared.token}/cover`} alt="" className="absolute inset-0 w-full h-full object-cover" />
        </div>
      )}
      <div className={`w-full max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10 ${shared.coverId ? "-mt-16 relative" : ""}`}>
        <header className={shared.coverId ? "card p-6 sm:p-8" : ""}>
          <p className="text-sm text-ink-soft">Recommendations from {ownerFirstName}</p>
          <h1 className="text-4xl sm:text-5xl mt-1">{city ? `${city.name}, ${city.stateName}` : "Favorite places"}</h1>
          {city?.impression && <p className="mt-3 font-display italic text-xl text-ink-soft">{city.impression}</p>}
          {city?.rating ? <div className="mt-2"><StarRating value={city.rating} readOnly size={16} /></div> : null}
        </header>

        {places.length === 0 ? (
          <p className="mt-10 text-ink-soft">No places on this list yet.</p>
        ) : (
          <>
            {markers.length > 0 && (
              <div className="mt-8">
                <SharedMap markers={markers} />
              </div>
            )}
            <div className="mt-10 space-y-10">
              {[...groups.entries()].map(([key, list]) => {
                const [cityName, state] = key.split("|");
                const heading = city ? PLACE_CATEGORY_LABEL[key as Cat] : `${cityName}, ${stateName(state)}`;
                return (
                  <section key={key} aria-label={heading}>
                    <h2 className="text-2xl mb-3 flex items-center gap-2">
                      {city && <span className="h-3 w-3 rounded-full" style={{ background: CATEGORY_COLORS[key as PlaceCategoryKey] }} aria-hidden />}
                      {heading}
                    </h2>
                    <ul className="grid sm:grid-cols-2 gap-3">
                      {list.map((p) => (
                        <li key={p.id} className="card p-4 flex flex-col">
                          {!city && (
                            <p className="text-xs font-semibold" style={{ color: CATEGORY_COLORS[p.category as PlaceCategoryKey] }}>
                              {PLACE_CATEGORY_LABEL[p.category as Cat]}
                            </p>
                          )}
                          <p className="font-display text-xl leading-tight flex items-center gap-1.5">
                            {p.name}
                            {p.favorite && <Heart size={13} className="fill-danger text-danger" aria-label="A favorite" />}
                          </p>
                          {p.address && <p className="text-xs text-ink-faint mt-0.5">{p.address}</p>}
                          {p.notes && <p className="text-sm text-ink-soft mt-2">{p.notes}</p>}
                          <div className="mt-auto pt-3 flex flex-wrap gap-1.5">
                            <a href={mapsUrl(p)} target="_blank" rel="noreferrer noopener" className="btn btn-secondary btn-sm">
                              <ExternalLink size={13} /> Open in Maps
                            </a>
                            {p.url && (
                              <a href={p.url} target="_blank" rel="noreferrer noopener" className="btn btn-ghost btn-sm">Website</a>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          </>
        )}
        <p className="mt-16 text-xs text-ink-faint">Shared from a private Travel Atlas journal.</p>
      </div>
    </main>
  );
}
