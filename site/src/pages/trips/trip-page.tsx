import { useParams } from "react-router";
import { PhotoGallery } from "@/components/photos/photo-gallery";
import { PhotoImg } from "@/components/photos/photo-img";
import { excerpt, formatDate, formatRange, nightsBetween } from "@/components/ui/format";
import { Container } from "@/components/ui/page-header";
import { Link, useTitle } from "@/lib/nav";
import { getTrip, listAlbums, useStore } from "@/lib/store";
import { NotFound } from "../not-found";
import { Itinerary, TripActions } from "./trip-client";

export function TripPage() {
  const id = useParams().id ?? "";
  const trip = useStore(() => getTrip(id), [id]);
  const albums = useStore(listAlbums);
  useTitle(trip?.name ?? "Trip");
  if (!trip) return <NotFound />;
  const nights = nightsBetween(trip.startDate, trip.endDate);
  const states = [...new Set(trip.stops.map((s) => s.stateCode))];

  return (
    <>
      {trip.cover && (
        <div className="relative h-[34vh] min-h-56 max-h-[440px] bg-fog">
          <PhotoImg id={trip.cover} variant="display" alt={`${trip.name} cover`} className="absolute inset-0 w-full h-full object-cover" />
        </div>
      )}
      <Container className={trip.cover ? "-mt-16 relative" : ""}>
        <div className={`flex flex-wrap items-end justify-between gap-6 ${trip.cover ? "card p-6 sm:p-8" : ""}`}>
          <div>
            <p className="text-sm text-ink-soft">
              <Link href="/trips" className="hover:text-pine hover:underline underline-offset-2">My Trips</Link>
            </p>
            <h1 className="text-5xl sm:text-6xl mt-1">{trip.name}</h1>
            <p className="mt-2 text-ink-soft">
              {formatRange(trip.startDate, trip.endDate) || "Dates not set"}
              {nights !== null && nights > 0 && `, ${nights} ${nights === 1 ? "night" : "nights"}`}
              {states.length > 0 && `, ${states.length} ${states.length === 1 ? "state" : "states"}`}
            </p>
            {trip.summary && <p className="mt-3 font-display italic text-xl text-ink-soft max-w-2xl">{trip.summary}</p>}
          </div>
          <TripActions trip={{ id: trip.id, name: trip.name, startDate: trip.startDate, endDate: trip.endDate, summary: trip.summary, notes: trip.notes }} />
        </div>

        <div className="grid lg:grid-cols-[1fr_420px] gap-10 mt-10">
          <div className="min-w-0 space-y-12">
            <section aria-labelledby="route-h">
              <h2 id="route-h" className="text-3xl mb-4">Route</h2>
              <Itinerary tripId={trip.id} stops={trip.stops} />
            </section>
            <section aria-labelledby="photos-h">
              <h2 id="photos-h" className="text-3xl mb-1">Photos</h2>
              <p className="text-sm text-ink-soft mb-4">To file photos under a city too, add them on the city page and use Select, then Add to trip.</p>
              <PhotoGallery photos={trip.photos} coverId={trip.cover} cover={{ type: "trip", tripId: trip.id }} upload={{ tripId: trip.id }} albums={albums.map((a) => ({ id: a.id, title: a.title }))} />
            </section>
          </div>
          <aside className="space-y-10 min-w-0">
            <section aria-labelledby="journal-h">
              <div className="flex items-end justify-between mb-3">
                <h2 id="journal-h" className="text-2xl">Journal</h2>
                <Link href={`/journal/new?trip=${trip.id}`} className="btn btn-secondary btn-sm">Write an entry</Link>
              </div>
              {trip.entries.length === 0 ? (
                <p className="text-sm text-ink-soft">No entries for this trip yet.</p>
              ) : (
                <ol className="relative border-l border-line-strong ml-1.5 space-y-5">
                  {trip.entries.map((e) => (
                    <li key={e.id} className="pl-5 relative">
                      <span className="absolute -left-[5px] top-2 h-2.5 w-2.5 rounded-full bg-pine ring-4 ring-paper" aria-hidden />
                      <Link href={`/journal/${e.id}`} className="group block">
                        <p className="text-xs text-ink-faint">{formatDate(e.entryDate)}{e.cityName && `, ${e.cityName}`}</p>
                        <p className="font-display text-lg group-hover:text-pine">{e.title}</p>
                        {e.body && <p className="text-sm text-ink-soft">{excerpt(e.body, 120)}</p>}
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            {trip.notes && (
              <section aria-labelledby="notes-h">
                <h2 id="notes-h" className="text-2xl mb-3">Notes</h2>
                <div className="prose-journal !text-base whitespace-pre-line">{trip.notes}</div>
              </section>
            )}
            {trip.albums.length > 0 && (
              <section aria-labelledby="albums-h">
                <h2 id="albums-h" className="text-2xl mb-3">Albums</h2>
                <ul className="space-y-1">
                  {trip.albums.map((a) => (
                    <li key={a.id}><Link className="text-pine hover:underline underline-offset-2" href={`/albums/${a.id}`}>{a.title}</Link></li>
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
