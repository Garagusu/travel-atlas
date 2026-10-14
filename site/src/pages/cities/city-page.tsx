import { useParams } from "react-router";
import { PhotoGallery } from "@/components/photos/photo-gallery";
import { PhotoImg } from "@/components/photos/photo-img";
import { excerpt, formatDate, formatRange } from "@/components/ui/format";
import { Container } from "@/components/ui/page-header";
import { Link, useTitle } from "@/lib/nav";
import { stateName } from "@/lib/states-meta";
import {
  cityById,
  cityCover,
  cityPhotos,
  cityPlaces,
  journalForCity,
  listAlbums,
  listTripOptions,
  nearbyCities,
  R,
  tripsForCity,
  useStore,
} from "@/lib/store";
import { NotFound } from "../not-found";
import { CityJournalForm, CityStatusBar } from "./city-editor";
import { PlacesSection } from "./places-section";

export function CityPage() {
  const cityId = Number(useParams().id);
  useTitle(useStore(() => cityById(cityId)?.name ?? "City", [cityId]));
  const d = useStore(() => {
    const city = cityById(cityId);
    if (!city) return null;
    return {
      city,
      log: R.cityLogs.get(cityId) ?? null,
      cover: cityCover(cityId),
      photos: cityPhotos(cityId),
      photoSpots: cityPhotos(cityId).flatMap((p) => (p.lat != null && p.lon != null ? [{ id: p.id, lat: p.lat, lon: p.lon }] : [])),
      places: cityPlaces(cityId),
      entries: journalForCity(cityId),
      trips: tripsForCity(cityId),
      albums: listAlbums(),
      tripOptions: listTripOptions(),
      nearby: nearbyCities(city.lat, city.lon, city.id),
    };
  }, [cityId]);
  if (!d) return <NotFound />;
  const { city, log, cover, photos, photoSpots, places, entries, trips, albums, tripOptions, nearby } = d;
  const status = log?.status ?? "not_visited";

  return (
    <>
      {cover && (
        <div className="relative h-[34vh] min-h-56 max-h-[420px] bg-fog">
          <PhotoImg id={cover} variant="display" alt={`${city.name} cover photo`} className="absolute inset-0 w-full h-full object-cover" />
        </div>
      )}
      <Container className={cover ? "-mt-16 relative" : ""}>
        <div className={cover ? "card p-6 sm:p-8" : ""}>
          <p className="text-sm text-ink-soft">
            <Link href={`/states/${city.state}`} className="hover:text-pine underline-offset-2 hover:underline">{stateName(city.state)}</Link>
            {city.pop > 0 && <span className="text-ink-faint">, population {city.pop.toLocaleString()}</span>}
            {city.custom && <span className="text-ink-faint">, added by you</span>}
          </p>
          <h1 className="text-5xl sm:text-6xl mt-1">{city.name}</h1>
          {log?.impression && <p className="mt-3 font-display italic text-xl text-ink-soft max-w-2xl">{log.impression}</p>}
          <div className="mt-5">
            <CityStatusBar cityId={city.id} cityName={city.name} status={status} visitedOn={log?.visitedOn ?? null} visitedUntil={log?.visitedUntil ?? null} rating={log?.rating ?? null} />
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_380px] gap-10 mt-10">
          <div className="min-w-0 space-y-12">
            <section aria-labelledby="photos-h">
              <h2 id="photos-h" className="text-3xl mb-4">Photos</h2>
              <PhotoGallery
                photos={photos}
                coverId={cover}
                cover={{ type: "city", cityId: city.id }}
                reorder={{ type: "city", cityId: city.id }}
                upload={{ cityId: city.id }}
                albums={albums.map((a) => ({ id: a.id, title: a.title }))}
                trips={tripOptions.map((t) => ({ id: t.id, title: t.name }))}
              />
            </section>

            <section aria-labelledby="journal-h">
              <h2 id="journal-h" className="text-3xl mb-4">Notes and memories</h2>
              <CityJournalForm
                key={city.id}
                cityId={city.id}
                cityName={city.name}
                initial={{
                  visitedOn: log?.visitedOn ?? "",
                  visitedUntil: log?.visitedUntil ?? "",
                  rating: log?.rating ?? null,
                  impression: log?.impression ?? "",
                  notes: log?.notes ?? "",
                  tags: log?.tags ?? [],
                }}
                hasRecord={!!log}
              />
            </section>

            <section aria-labelledby="entries-h">
              <div className="flex items-end justify-between gap-4 mb-4">
                <h2 id="entries-h" className="text-3xl">Journal entries</h2>
                <Link href={`/journal/new?city=${city.id}`} className="btn btn-secondary btn-sm">Write an entry</Link>
              </div>
              {entries.length === 0 ? (
                <p className="text-ink-soft text-sm">No journal entries for {city.name} yet.</p>
              ) : (
                <ul className="divide-y divide-line border-y border-line">
                  {entries.map((e) => (
                    <li key={e.id}>
                      <Link href={`/journal/${e.id}`} className="block py-4 group">
                        <p className="text-sm text-ink-faint">{formatDate(e.entryDate)}</p>
                        <p className="font-display text-xl group-hover:text-pine">{e.title}</p>
                        {e.body && <p className="text-sm text-ink-soft mt-1">{excerpt(e.body, 160)}</p>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside className="space-y-10 min-w-0">
            <PlacesSection
              city={{ id: city.id, name: city.name, lat: city.lat, lon: city.lon, stateCode: city.state, status }}
              places={places}
              nearby={nearby}
              photoSpots={photoSpots}
            />
            <section aria-labelledby="trips-h">
              <h2 id="trips-h" className="text-2xl mb-3">Trips</h2>
              {trips.length === 0 ? (
                <p className="text-sm text-ink-soft">
                  Not part of a trip yet. <Link href="/trips" className="text-pine underline underline-offset-2">Add it to one</Link>.
                </p>
              ) : (
                <ul className="space-y-2">
                  {trips.map((t) => (
                    <li key={t.id}>
                      <Link href={`/trips/${t.id}`} className="block card px-4 py-3 hover:border-line-strong">
                        <p className="font-medium">{t.name}</p>
                        <p className="text-sm text-ink-soft">{formatRange(t.startDate, t.endDate) || "Dates not set"}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <p className="text-sm">
              <Link href={`/?city=${city.id}`} className="text-pine underline underline-offset-2">Show on the big map</Link>
            </p>
          </aside>
        </div>
      </Container>
    </>
  );
}
