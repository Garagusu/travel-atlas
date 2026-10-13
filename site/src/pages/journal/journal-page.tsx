import { useState } from "react";
import { useSearchParams } from "react-router";
import { PhotoImg } from "@/components/photos/photo-img";
import { EmptyState } from "@/components/ui/empty-state";
import { excerpt, formatDate, formatMonth } from "@/components/ui/format";
import { Container, PageHeader } from "@/components/ui/page-header";
import { Link, useTitle } from "@/lib/nav";
import { journalTags, listJournal, listTripOptions, useStore } from "@/lib/store";

export function JournalPage() {
  useTitle("Travel Journal");
  const [sp, setSp] = useSearchParams();
  const q = sp.get("q") ?? "";
  const tag = sp.get("tag") ?? "";
  const tripId = sp.get("trip") ?? "";
  const [draft, setDraft] = useState(q);
  const entries = useStore(() => listJournal({ q: q || undefined, tag: tag || undefined, tripId: tripId || undefined }), [q, tag, tripId]);
  const tags = useStore(journalTags);
  const trips = useStore(listTripOptions);
  const set = (patch: Record<string, string>) => {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) (v ? n.set(k, v) : n.delete(k));
    setSp(n, { replace: true });
  };
  const groups = new Map<string, typeof entries>();
  for (const e of entries) groups.set(e.entryDate.slice(0, 7), [...(groups.get(e.entryDate.slice(0, 7)) ?? []), e]);
  const filtered = q || tag || tripId;

  return (
    <Container className="max-w-5xl">
      <PageHeader title="Travel Journal" subtitle="Stories from the road, newest first." actions={<Link href="/journal/new" className="btn btn-primary">New entry</Link>} />
      <form
        noValidate
        role="search"
        className="flex flex-wrap gap-2 mb-4"
        onSubmit={(e) => {
          e.preventDefault();
          set({ q: draft.trim() });
        }}
      >
        <input type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search titles, stories, places, tags" className="input !w-80 max-w-full" aria-label="Search journal" />
        <select value={tripId} onChange={(e) => set({ trip: e.target.value })} className="input !w-56" aria-label="Trip">
          <option value="">All trips</option>
          {trips.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
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
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-10">
          {tags.map((t) => (
            <button key={t.tag} onClick={() => set({ tag: tag === t.tag ? "" : t.tag })} className="chip" data-active={tag === t.tag}>
              {t.tag} <span className="opacity-60">{t.n}</span>
            </button>
          ))}
        </div>
      )}
      {entries.length === 0 ? (
        filtered ? (
          <EmptyState title="No entries match" />
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
                          <PhotoImg id={e.cover} alt="" loading="lazy" className="w-full h-full object-cover" />
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
