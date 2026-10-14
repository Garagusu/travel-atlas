import { LocateOlderPhotos } from "@/components/photos/locate-older-photos";
import { PhotoImg } from "@/components/photos/photo-img";
import { countPhotosToLocate } from "@/lib/actions";
import { EmptyState } from "@/components/ui/empty-state";
import { Container, PageHeader } from "@/components/ui/page-header";
import { Link, useTitle } from "@/lib/nav";
import { listAlbums, listTripOptions, R, useStore } from "@/lib/store";
import { AlbumFormButton, Library } from "./albums-client";

export function AlbumsPage() {
  useTitle("Photo Albums");
  const albums = useStore(listAlbums);
  const trips = useStore(() => listTripOptions().map((t) => ({ id: t.id, title: t.name })));
  const photoCount = useStore(() => R.photos.size);
  const toLocate = useStore(countPhotosToLocate);
  return (
    <Container>
      <PageHeader
        title="Photo Albums"
        subtitle={`${photoCount.toLocaleString()} ${photoCount === 1 ? "photo" : "photos"} across ${albums.length} ${albums.length === 1 ? "album" : "albums"}.`}
        actions={<AlbumFormButton trips={trips} />}
      />
      {albums.length === 0 ? (
        <EmptyState title="No albums yet" action={<AlbumFormButton trips={trips} />}>
          Group photos from different cities into albums like “Boston Trip” or “California Road Trip”. A photo can sit in several albums without being copied.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {albums.map((a) => (
            <li key={a.id}>
              <Link href={`/albums/${a.id}`} className="group block">
                <div className="relative aspect-square">
                  <div className="absolute inset-0 translate-x-1.5 -translate-y-1.5 rounded-xl bg-card border border-line" aria-hidden />
                  <div className="absolute inset-0 rounded-xl overflow-hidden bg-fog border border-line shadow-[var(--shadow-soft)] group-hover:shadow-[var(--shadow-lift)] transition-shadow">
                    {a.cover ? (
                      <PhotoImg id={a.cover} alt="" loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm text-ink-faint">Empty album</div>
                    )}
                  </div>
                </div>
                <p className="font-display text-lg mt-3 group-hover:text-pine leading-tight">{a.title}</p>
                <p className="text-sm text-ink-soft">{a.photoCount} {a.photoCount === 1 ? "photo" : "photos"}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <section className="mt-16" aria-labelledby="all-h">
        {/* stays mounted after it finishes so its result stays on screen */}
        <LocateOlderPhotos count={toLocate} />
        <h2 id="all-h" className="text-3xl mb-1">All photos</h2>
        <p className="text-sm text-ink-soft mb-5">Newest first. Add photos here that don&apos;t belong to a particular city, or select photos to file them into albums.</p>
        <Library albums={albums.map((a) => ({ id: a.id, title: a.title }))} trips={trips} />
      </section>
    </Container>
  );
}
