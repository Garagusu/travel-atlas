import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { excerpt, formatDate, formatMonth } from "@/components/ui/format";
import { Container, PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { photoUrl } from "@/lib/constants";
import { journalTags, listJournal, listTripOptions } from "@/lib/data";

export const metadata = { title: "Travel Journal" };

export default async function JournalPage({ searchParams }: PageProps<"/journal">) {
  const user = await requireUser();
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);
  const q = str(sp.q)?.slice(0, 100);
  const tag = str(sp.tag);
  const tripId = str(sp.trip);
  const [entries, tags, trips] = await Promise.all([
    listJournal(user.id, { q, tag, tripId: tripId && /^[0-9a-f-]{36}$/i.test(tripId) ? tripId : undefined }),
    journalTags(user.id),
    listTripOptions(user.id),
  ]);
  const groups = new Map<string, typeof entries>();
  for (const e of entries) {
    const k = e.entryDate.slice(0, 7);
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  const filtered = q || tag || tripId;

  return (
    <Container className="max-w-5xl">
      <PageHeader title="Travel Journal" subtitle="Stories from the road, newest first." actions={<Link href="/journal/new" className="btn btn-primary">New entry</Link>} />

      <form noValidate action="/journal" className="flex flex-wrap gap-2 mb-4" role="search">
        <input type="search" name="q" defaultValue={q} placeholder="Search titles, stories, places, tags" className="input !w-80 max-w-full" aria-label="Search journal" />
        <select name="trip" defaultValue={tripId ?? ""} className="input !w-56" aria-label="Trip">
          <option value="">All trips</option>
          {trips.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        {tag && <input type="hidden" name="tag" value={tag} />}
        <button className="btn btn-secondary">Search</button>
        {filtered && <Link href="/journal" className="btn btn-ghost">Reset</Link>}
      </form>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-10">
          {tags.map((t) => (
            <Link key={t.tag} href={tag === t.tag ? "/journal" : `/journal?tag=${encodeURIComponent(t.tag)}`} className="chip" data-active={tag === t.tag}>
              {t.tag} <span className="opacity-60">{t.n}</span>
            </Link>
          ))}
        </div>
      )}

      {entries.length === 0 ? (
        filtered ? (
          <EmptyState title="No entries match" action={<Link href="/journal" className="btn btn-secondary">Show all entries</Link>} />
        ) : (
          <EmptyState title="Your journal is waiting" action={<Link href="/journal/new" className="btn btn-primary">Write the first entry</Link>}>
            Write about a day, a meal or a whole trip. Attach photos and link it to a city so it shows up there too.
          </EmptyState>
        )
      ) : (
        <div className="space-y-12">
          {[...groups.entries()].map(([month, list]) => (
            <section key={month} aria-label={formatMonth(`${month}-01`)}>
              <h2 className="text-xl text-ink-soft mb-4 italic">{formatMonth(`${month}-01`)}</h2>
              <ul className="space-y-4">
                {list.map((e) => (
                  <li key={e.id}>
                    <Link href={`/journal/${e.id}`} className="group card flex flex-col sm:flex-row overflow-hidden hover:shadow-[var(--shadow-lift)] transition-shadow">
                      {e.cover && (
                        <div className="sm:w-56 aspect-[16/10] sm:aspect-auto shrink-0 bg-fog">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={photoUrl(e.cover)} alt="" loading="lazy" className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="p-5 min-w-0">
                        <p className="text-sm text-ink-faint">
                          {formatDate(e.entryDate)}
                          {e.cityName && `, ${e.cityName}, ${e.stateCode}`}
                          {e.tripName && `, ${e.tripName}`}
                        </p>
                        <p className="font-display text-2xl leading-tight mt-0.5 group-hover:text-pine">{e.title}</p>
                        {e.body && <p className="text-ink-soft mt-2 line-clamp-2">{excerpt(e.body, 260)}</p>}
                        <div className="mt-3 flex flex-wrap gap-1.5 items-center">
                          {e.tags.slice(0, 5).map((t) => (
                            <span key={t} className="text-[11px] rounded-full bg-fog px-2 py-0.5 text-ink-soft">{t}</span>
                          ))}
                          {e.photoCount > 0 && <span className="text-xs text-ink-faint ml-1">{e.photoCount} {e.photoCount === 1 ? "photo" : "photos"}</span>}
                        </div>
                      </div>
                    </Link>
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
