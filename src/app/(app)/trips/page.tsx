import Link from "next/link";
import { NewTripButton } from "@/components/forms/trip-form";
import { TripStatesMark } from "@/components/trip-states-mark";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRange, nightsBetween } from "@/components/ui/format";
import { Container, PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { photoUrl } from "@/lib/constants";
import { listTrips } from "@/lib/data";

export const metadata = { title: "My Trips" };

export default async function TripsPage() {
  const user = await requireUser();
  const trips = await listTrips(user.id);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = trips.filter((t) => t.startDate && t.startDate > today);
  const past = trips.filter((t) => !(t.startDate && t.startDate > today));

  const Card = ({ t }: { t: (typeof trips)[number] }) => {
    const nights = nightsBetween(t.startDate, t.endDate);
    return (
      <Link href={`/trips/${t.id}`} className="group block card overflow-hidden hover:shadow-[var(--shadow-lift)] transition-shadow">
        <div className="aspect-[16/9] bg-fog relative overflow-hidden">
          {t.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl(t.cover, "display")} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300" />
          ) : (
            <div className="absolute inset-0 p-5 sm:p-6 bg-[#f3f0e9]">
              <TripStatesMark codes={t.stateCodes} />
            </div>
          )}
        </div>
        <div className="p-5">
          <p className="font-display text-2xl leading-tight group-hover:text-pine">{t.name}</p>
          <p className="text-sm text-ink-soft mt-1">
            {formatRange(t.startDate, t.endDate) || "Dates not set"}
            {nights !== null && nights > 0 && <span className="text-ink-faint">, {nights} {nights === 1 ? "night" : "nights"}</span>}
          </p>
          {t.summary && <p className="text-sm mt-2">{t.summary}</p>}
          <p className="text-xs text-ink-faint mt-3">
            {t.stopCount} {t.stopCount === 1 ? "stop" : "stops"}, {t.photoCount} {t.photoCount === 1 ? "photo" : "photos"}
            {t.stateCodes.length > 0 && `, ${t.stateCodes.join(", ")}`}
          </p>
        </div>
      </Link>
    );
  };

  return (
    <Container>
      <PageHeader title="My Trips" subtitle="Each trip keeps its route, dates, photos and journal together." actions={<NewTripButton />} />
      {trips.length === 0 ? (
        <EmptyState title="No trips yet" action={<NewTripButton />}>
          Create a trip like “Boston Weekend” or “Southwest National Parks”, then add the cities you visited in order.
        </EmptyState>
      ) : (
        <div className="space-y-12">
          {upcoming.length > 0 && (
            <section aria-labelledby="up-h">
              <h2 id="up-h" className="text-2xl mb-4">Coming up</h2>
              <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {upcoming.map((t) => <li key={t.id}><Card t={t} /></li>)}
              </ul>
            </section>
          )}
          <section aria-labelledby="past-h">
            {upcoming.length > 0 && <h2 id="past-h" className="text-2xl mb-4">Past trips</h2>}
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {past.map((t) => <li key={t.id}><Card t={t} /></li>)}
            </ul>
          </section>
        </div>
      )}
    </Container>
  );
}
