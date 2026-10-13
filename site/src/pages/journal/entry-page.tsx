import { useParams } from "react-router";
import { PhotoGallery } from "@/components/photos/photo-gallery";
import { formatDate } from "@/components/ui/format";
import { Container } from "@/components/ui/page-header";
import { Link, useTitle } from "@/lib/nav";
import { stateName } from "@/lib/states-meta";
import { getJournalEntry, listAlbums, useStore } from "@/lib/store";
import { NotFound } from "../not-found";
import { EntryActions } from "./entry-actions";

export function EntryPage() {
  const id = useParams().id ?? "";
  const e = useStore(() => getJournalEntry(id), [id]);
  const albums = useStore(listAlbums);
  useTitle(e?.title ?? "Journal entry");
  if (!e) return <NotFound />;
  const paragraphs = e.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <Container className="max-w-4xl">
      <p className="text-sm text-ink-soft">
        <Link href="/journal" className="hover:text-pine hover:underline underline-offset-2">Travel Journal</Link>
      </p>
      <header className="mt-2 mb-8">
        <p className="text-ink-soft">
          {formatDate(e.entryDate)}
          {e.cityId && e.stateCode && (
            <>
              {", "}
              <Link href={`/cities/${e.cityId}`} className="text-pine hover:underline underline-offset-2">{e.cityName}</Link>
              {", "}
              <Link href={`/states/${e.stateCode}`} className="hover:underline underline-offset-2">{stateName(e.stateCode)}</Link>
            </>
          )}
          {e.tripId && e.tripName && (
            <>
              {", "}
              <Link href={`/trips/${e.tripId}`} className="hover:underline underline-offset-2">{e.tripName}</Link>
            </>
          )}
        </p>
        <h1 className="text-5xl sm:text-6xl mt-2">{e.title}</h1>
        <div className="mt-5">
          <EntryActions id={e.id} title={e.title} />
        </div>
      </header>
      <article className="prose-journal">
        {paragraphs.length ? paragraphs.map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>) : <p className="text-ink-faint">Nothing written yet.</p>}
      </article>
      {e.highlights && (
        <aside className="mt-10 border-l-[3px] border-marigold-bright pl-5 max-w-[68ch]">
          <p className="text-sm font-semibold text-ink-soft mb-1">Highlights</p>
          <p className="font-display text-lg whitespace-pre-line">{e.highlights}</p>
        </aside>
      )}
      {(e.placesVisited.length > 0 || e.tags.length > 0) && (
        <div className="mt-10 grid sm:grid-cols-2 gap-6">
          {e.placesVisited.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-ink-soft mb-2">Places visited</p>
              <ul className="space-y-1">
                {e.placesVisited.map((p) => (
                  <li key={p} className="flex gap-2"><span className="text-marigold" aria-hidden>●</span>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {e.tags.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-ink-soft mb-2">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {e.tags.map((t) => (
                  <Link key={t} href={`/journal?tag=${encodeURIComponent(t)}`} className="chip hover:border-ink-faint">{t}</Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <section className="mt-12" aria-labelledby="ph-h">
        <h2 id="ph-h" className="text-3xl mb-4">Photos</h2>
        <PhotoGallery
          photos={e.photos}
          removeFrom={{ type: "entry", entryId: e.id }}
          upload={{ journalEntryId: e.id, ...(e.cityId ? { cityId: e.cityId } : {}), ...(e.tripId ? { tripId: e.tripId } : {}) }}
          albums={albums.map((a) => ({ id: a.id, title: a.title }))}
        />
      </section>
    </Container>
  );
}
