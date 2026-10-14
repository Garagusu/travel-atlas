import Link from "next/link";
import { notFound } from "next/navigation";
import { PhotoGallery } from "@/components/photos/photo-gallery";
import { Container } from "@/components/ui/page-header";
import { excerpt, formatDate, formatRange } from "@/components/ui/format";
import { requireUser } from "@/lib/auth";
import { photoUrl } from "@/lib/constants";
import {
  getCity,
  getCityPhotos,
  getCityPlaces,
  getJournalForCity,
  getTripsForCity,
  listAlbums,
  listTripOptions,
  nearbyCities,
} from "@/lib/data";
import { CityJournalForm, CityStatusBar } from "./city-editor";
import { PlacesSection } from "./places-section";

export async function generateMetadata({ params }: PageProps<"/cities/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const c = Number(id) ? await getCity(user.id, Number(id)) : null;
  return { title: c ? `${c.city.name}, ${c.city.stateCode}` : "City" };
}

export default async function CityPage({ params }: PageProps<"/cities/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const cityId = Number(id);
  if (!Number.isInteger(cityId) || cityId <= 0) notFound();
  const data = await getCity(user.id, cityId);
  if (!data) notFound();
  const { city, log, stateName, cover } = data;

  const [photos, places, entries, trips, albums, tripOptions, nearby] = await Promise.all([
    getCityPhotos(user.id, cityId),
    getCityPlaces(user.id, cityId),
    getJournalForCity(user.id, cityId),
    getTripsForCity(user.id, cityId),
    listAlbums(user.id),
    listTripOptions(user.id),
    nearbyCities(city.lat, city.lon, city.id),
  ]);
  const status = log?.status ?? "not_visited";

  return (
    <>
      {cover && (
        <div className="relative h-[34vh] min-h-56 max-h-[420px] bg-fog">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl(cover, "display")} alt={`${city.name} cover photo`} className="absolute inset-0 w-full h-full object-cover" />
        </div>
      )}
      <Container className={cover ? "-mt-16 relative" : ""}>
        <div className={cover ? "card p-6 sm:p-8" : ""}>
          <p className="text-sm text-ink-soft">
            <Link href={`/states/${city.stateCode}`} className="hover:text-pine underline-offset-2 hover:underline">{stateName}</Link>
            {city.population > 0 && <span className="text-ink-faint">, population {city.population.toLocaleString()}</span>}
            {city.createdBy && <span className="text-ink-faint">, added by you</span>}
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
              city={{ id: city.id, name: city.name, lat: city.lat, lon: city.lon, stateCode: city.stateCode, status }}
              places={places}
              nearby={nearby}
              photoSpots={photos.flatMap((p) => (p.lat !== null && p.lon !== null ? [{ id: p.id, lat: p.lat, lon: p.lon }] : []))}
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
