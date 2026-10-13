import { CityCard } from "@/components/cards/city-card";
import { VisitedMap } from "@/components/map/visited-map";
import { PhotoImg } from "@/components/photos/photo-img";
import { TileGrid } from "@/components/tile-grid";
import { formatDate, formatRange, todayIso } from "@/components/ui/format";
import { Container } from "@/components/ui/page-header";
import { Link, useTitle } from "@/lib/nav";
import { getStateStatuses, getStats, listTrips, recentPhotos, recentVisitedCities, useStore, wishlist } from "@/lib/store";

export function DashboardPage() {
  useTitle("Overview");
  const stats = useStore(getStats);
  const statuses = useStore(getStateStatuses);
  const recent = useStore(() => recentVisitedCities(3));
  const photos = useStore(() => recentPhotos(9));
  const wish = useStore(() => wishlist(6));
  const trips = useStore(listTrips);
  const today = todayIso();
  const upcomingTrips = trips.filter((t) => t.startDate && t.startDate >= today).reverse().slice(0, 3);
  const remaining = 50 - stats.statesVisited;

  return (
    <Container>
      <section className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-8 lg:gap-12 items-center">
        <div>
          <p className="text-ink-soft">Your travels so far</p>
          <p className="font-display leading-[0.95] mt-2">
            <span className="text-[5.5rem] sm:text-[7rem] tracking-tight">{stats.statesVisited}</span>
            <span className="text-3xl text-ink-faint"> of 50 states</span>
          </p>
          <div className="mt-5 h-2.5 rounded-full bg-fog overflow-hidden" role="progressbar" aria-valuenow={stats.percentExplored} aria-valuemin={0} aria-valuemax={100} aria-label="Share of states visited">
            <div className="h-full bg-pine rounded-full" style={{ width: `${stats.percentExplored}%` }} />
          </div>
          <p className="mt-2 text-sm text-ink-soft">
            {stats.percentExplored}% of the country explored. {remaining > 0 ? `${remaining} ${remaining === 1 ? "state" : "states"} to go.` : "Every state visited."}
          </p>
          <dl className="mt-8 grid grid-cols-4 gap-4 border-t border-line pt-5">
            {[
              { label: "cities visited", value: stats.citiesVisited, href: "/cities?status=visited" },
              { label: "trips", value: stats.trips, href: "/trips" },
              { label: "photos", value: stats.photos, href: "/albums" },
              { label: "journal entries", value: stats.journalEntries, href: "/journal" },
            ].map((s) => (
              <Link key={s.label} href={s.href} className="group">
                <dd className="font-display text-3xl group-hover:text-pine">{s.value.toLocaleString()}</dd>
                <dt className="text-xs text-ink-soft leading-tight mt-0.5">{s.label}</dt>
              </Link>
            ))}
          </dl>
        </div>
        <VisitedMap />
      </section>

      <section className="mt-14 grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-10" aria-label="States and wishlist">
        <div>
          <h2 className="text-2xl mb-4">State by state</h2>
          <TileGrid statuses={statuses} hrefPrefix="/states/" />
        </div>
        <div>
          <div className="flex items-end justify-between mb-4">
            <h2 className="text-2xl">Up next</h2>
            <Link href="/wishlist" className="text-sm text-pine hover:underline underline-offset-2">Whole wishlist</Link>
          </div>
          {upcomingTrips.length === 0 && wish.length === 0 ? (
            <p className="text-ink-soft text-sm">
              Nothing planned yet. Mark cities as “Want to visit” on the <Link href="/" className="text-pine underline underline-offset-2">map</Link> to build a wishlist.
            </p>
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {upcomingTrips.map((t) => (
                <li key={t.id}>
                  <Link href={`/trips/${t.id}`} className="flex items-center justify-between gap-4 py-3 group">
                    <span>
                      <span className="font-medium group-hover:text-pine">{t.name}</span>
                      <span className="block text-sm text-ink-soft">Trip, {formatRange(t.startDate, t.endDate)}</span>
                    </span>
                    <span className="text-xs rounded-full bg-pine-soft text-pine-deep px-2 py-0.5 font-semibold shrink-0">Planned</span>
                  </Link>
                </li>
              ))}
              {wish.map((c) => (
                <li key={c.id}>
                  <Link href={`/cities/${c.id}`} className="flex items-center justify-between gap-4 py-3 group">
                    <span>
                      <span className="font-medium group-hover:text-pine">{c.name}</span>
                      <span className="block text-sm text-ink-soft">{c.stateName}{c.placeCount ? `, ${c.placeCount} saved ${c.placeCount === 1 ? "place" : "places"}` : ""}</span>
                    </span>
                    <span className="text-xs rounded-full bg-marigold-soft text-[#7a520c] px-2 py-0.5 font-semibold shrink-0">Wishlist</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-14" aria-labelledby="recent-h">
        <div className="flex items-end justify-between mb-4">
          <h2 id="recent-h" className="text-2xl">Recently visited</h2>
          <Link href="/cities?status=visited" className="text-sm text-pine hover:underline underline-offset-2">All visited cities</Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-ink-soft text-sm">Cities you mark as visited will appear here.</p>
        ) : (
          <ul className="grid sm:grid-cols-3 gap-5">
            {recent.map((c) => (
              <li key={c.id}><CityCard c={c} /></li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-14" aria-labelledby="mem-h">
        <div className="flex items-end justify-between mb-4">
          <h2 id="mem-h" className="text-2xl">Recent photo memories</h2>
          <Link href="/albums" className="text-sm text-pine hover:underline underline-offset-2">All photos</Link>
        </div>
        {photos.length === 0 ? (
          <p className="text-ink-soft text-sm">Add photos on a city page and your latest memories show up here.</p>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {photos.map((p, i) => (
              <li key={p.id} className={i === 0 ? "col-span-2 row-span-2" : ""}>
                <Link href={p.cityId ? `/cities/${p.cityId}` : "/albums"} className="group block relative h-full rounded-xl overflow-hidden bg-fog" style={{ background: p.dominantColor ?? undefined }}>
                  <PhotoImg id={p.id} variant={i === 0 ? "display" : "thumb"} alt={p.caption ?? "Travel photo"} loading="lazy" className={`w-full h-full object-cover ${i === 0 ? "aspect-square sm:aspect-auto" : "aspect-square"} group-hover:scale-[1.02] transition-transform duration-300`} />
                  {(p.caption || p.cityName) && (
                    <span className="absolute left-2 bottom-2 right-2 truncate text-xs text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.6)]">
                      {p.caption ?? `${p.cityName}${p.takenOn ? `, ${formatDate(p.takenOn)}` : ""}`}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Container>
  );
}
