import { useParams } from "react-router";
import { PhotoGallery } from "@/components/photos/photo-gallery";
import { PhotoImg } from "@/components/photos/photo-img";
import { StatusBadge } from "@/components/status-control";
import { excerpt, formatDate, formatRange, plural } from "@/components/ui/format";
import { Container } from "@/components/ui/page-header";
import { stateOutline, useStatesGeo } from "@/lib/geo";
import { Link, useTitle } from "@/lib/nav";
import { STATE_BY_CODE } from "@/lib/states-meta";
import { getStateDetail, listAlbums, listTripOptions, useStore } from "@/lib/store";
import { NotFound } from "../not-found";
import { AddCityForm, QuickStatus, StateNotes } from "./state-client";

export function StatePage() {
  const code = (useParams().code ?? "").toUpperCase();
  const meta = STATE_BY_CODE.get(code);
  useTitle(meta?.name ?? "State");
  const d = useStore(() => (meta ? { ...getStateDetail(code), albums: listAlbums(), trips2: listTripOptions() } : null), [code]);
  const geo = useStatesGeo();
  if (!meta || !d) return <NotFound />;

  const visited = d.myCities.filter((c) => c.status === "visited");
  const wanted = d.myCities.filter((c) => c.status === "want_to_visit");
  const statusById = new Map(d.myCities.map((c) => [c.id, c.status]));
  const top10 = d.topCities.slice(0, 10);
  const top10Visited = top10.filter((c) => statusById.get(c.id) === "visited").length;
  const outline = geo ? stateOutline(geo, code) : null;

  return (
    <>
      {d.coverId && (
        <div className="relative h-[30vh] min-h-52 max-h-[380px] bg-fog">
          <PhotoImg id={d.coverId} variant="display" alt={`${meta.name} cover photo`} className="absolute inset-0 w-full h-full object-cover" />
        </div>
      )}
      <Container className={d.coverId ? "-mt-16 relative" : ""}>
        <div className={`grid md:grid-cols-[1fr_auto] gap-8 items-center ${d.coverId ? "card p-6 sm:p-8" : ""}`}>
          <div>
            <p className="text-sm text-ink-soft">
              <Link href={`/?state=${code}`} className="hover:text-pine hover:underline underline-offset-2">Show on map</Link>
              {!meta.isState && <span className="text-ink-faint">, federal district (not counted in the 50)</span>}
            </p>
            <h1 className="text-5xl sm:text-6xl mt-1">{meta.name}</h1>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-ink-soft">
              <span><strong className="font-display text-2xl text-ink font-medium">{visited.length}</strong> {visited.length === 1 ? "city" : "cities"} visited</span>
              <span><strong className="font-display text-2xl text-ink font-medium">{wanted.length}</strong> on your wishlist</span>
              <span><strong className="font-display text-2xl text-ink font-medium">{d.photoCount}</strong> {d.photoCount === 1 ? "photo" : "photos"}</span>
              <span><strong className="font-display text-2xl text-ink font-medium">{d.trips.length}</strong> {d.trips.length === 1 ? "trip" : "trips"}</span>
            </div>
            <div className="mt-5 max-w-md">
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-ink-soft">Largest 10 cities visited</span>
                <span className="font-semibold">{top10Visited} of {top10.length}</span>
              </div>
              <div className="h-2 rounded-full bg-fog overflow-hidden" role="progressbar" aria-valuenow={top10Visited} aria-valuemin={0} aria-valuemax={top10.length} aria-label="Largest cities visited">
                <div className="h-full bg-pine rounded-full" style={{ width: `${top10.length ? (top10Visited / top10.length) * 100 : 0}%` }} />
              </div>
            </div>
          </div>
          {outline && (
            <svg viewBox={`0 0 ${outline.width} ${outline.height}`} className="w-full max-w-[360px] h-auto" role="img" aria-label={`Outline of ${meta.name} with your cities`}>
              <path d={outline.path} fill={visited.length ? "#d6e8e0" : wanted.length ? "#f8ead0" : "#eeeae2"} stroke="#1e2a30" strokeWidth={1.2} strokeLinejoin="round" />
              {d.myCities
                .filter((c) => c.status !== "not_visited")
                .map((c) => {
                  const pt = outline.project(c.lon, c.lat);
                  if (!pt) return null;
                  return (
                    <circle key={c.id} cx={pt.x} cy={pt.y} r={c.status === "visited" ? 4.5 : 3.8} fill={c.status === "visited" ? "#2d6a5a" : "#e2a33b"} stroke="#fff" strokeWidth={1.5}>
                      <title>{c.name}</title>
                    </circle>
                  );
                })}
            </svg>
          )}
        </div>

        <div className="grid lg:grid-cols-[1fr_360px] gap-10 mt-12">
          <div className="min-w-0 space-y-12">
            <section aria-labelledby="mycities-h">
              <h2 id="mycities-h" className="text-3xl mb-4">Your cities</h2>
              {d.myCities.length === 0 ? (
                <p className="text-ink-soft">You haven&apos;t marked any cities in {meta.name} yet. Start with the largest cities.</p>
              ) : (
                <ul className="grid sm:grid-cols-2 gap-3">
                  {d.myCities.map((c) => (
                    <li key={c.id}>
                      <Link href={`/cities/${c.id}`} className="card flex gap-3 p-2.5 pr-4 hover:border-line-strong h-full">
                        <div className="h-16 w-20 rounded-lg bg-fog overflow-hidden shrink-0">
                          {c.cover && <PhotoImg id={c.cover} alt="" loading="lazy" className="w-full h-full object-cover" />}
                        </div>
                        <div className="min-w-0 py-0.5">
                          <p className="font-medium truncate">{c.name}</p>
                          <div className="mt-1 flex items-center gap-2 flex-wrap">
                            <StatusBadge status={c.status} />
                            {c.visitedOn && <span className="text-xs text-ink-faint">{formatDate(c.visitedOn)}</span>}
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="photos-h">
              <h2 id="photos-h" className="text-3xl mb-1">Photos from {meta.name}</h2>
              <p className="text-sm text-ink-soft mb-4">Add photos on a city page; they collect here.{d.photoCount > d.photos.length ? ` Showing the latest ${d.photos.length}.` : ""}</p>
              <PhotoGallery
                photos={d.photos}
                coverId={d.coverId}
                cover={{ type: "state", code }}
                albums={d.albums.map((a) => ({ id: a.id, title: a.title }))}
                trips={d.trips2.map((t) => ({ id: t.id, title: t.name }))}
                emptyText={`No photos from ${meta.name} yet.`}
              />
            </section>

            <section aria-labelledby="notes-h">
              <h2 id="notes-h" className="text-3xl mb-4">Notes and memorable experiences</h2>
              <StateNotes key={code} code={code} initial={d.log?.notes ?? ""} />
            </section>

            {d.entries.length > 0 && (
              <section aria-labelledby="entries-h">
                <h2 id="entries-h" className="text-3xl mb-4">Journal entries</h2>
                <ul className="divide-y divide-line border-y border-line">
                  {d.entries.map((e) => (
                    <li key={e.id}>
                      <Link href={`/journal/${e.id}`} className="block py-4 group">
                        <p className="text-sm text-ink-faint">{formatDate(e.entryDate)}, {e.cityName}</p>
                        <p className="font-display text-xl group-hover:text-pine">{e.title}</p>
                        {e.body && <p className="text-sm text-ink-soft mt-1">{excerpt(e.body, 150)}</p>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <aside className="space-y-10 min-w-0">
            <section aria-labelledby="largest-h">
              <h2 id="largest-h" className="text-2xl mb-1">Largest cities</h2>
              <p className="text-sm text-ink-soft mb-3">{plural(d.totalCities, "city or town", "cities and towns")} in our list for {meta.name}.</p>
              <ul className="divide-y divide-line">
                {d.topCities.slice(0, 16).map((c) => (
                  <li key={c.id} className="flex items-center gap-3 py-2">
                    <Link href={`/cities/${c.id}`} className="flex-1 min-w-0 truncate hover:text-pine">{c.name}</Link>
                    <QuickStatus cityId={c.id} cityName={c.name} status={statusById.get(c.id) ?? "not_visited"} />
                  </li>
                ))}
              </ul>
            </section>
            {d.topCities[0] && (
              <section aria-labelledby="add-h">
                <h2 id="add-h" className="text-2xl mb-1">A town that isn&apos;t listed?</h2>
                <p className="text-sm text-ink-soft mb-3">The list covers places with at least 1,000 residents. Add a smaller one by pinning it on the map.</p>
                <AddCityForm stateCode={code} center={{ lon: d.topCities[0].lon, lat: d.topCities[0].lat }} />
              </section>
            )}
            {d.trips.length > 0 && (
              <section aria-labelledby="trips-h">
                <h2 id="trips-h" className="text-2xl mb-3">Trips through {meta.name}</h2>
                <ul className="space-y-2">
                  {d.trips.map((t) => (
                    <li key={t.id}>
                      <Link href={`/trips/${t.id}`} className="block card px-4 py-3 hover:border-line-strong">
                        <p className="font-medium">{t.name}</p>
                        <p className="text-sm text-ink-soft">{formatRange(t.startDate, t.endDate) || "Dates not set"}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      </Container>
    </>
  );
}
