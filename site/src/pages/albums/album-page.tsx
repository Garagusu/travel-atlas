import { useParams } from "react-router";
import { PhotoGallery } from "@/components/photos/photo-gallery";
import { Container } from "@/components/ui/page-header";
import { Link, useTitle } from "@/lib/nav";
import { getAlbum, listAlbums, listTripOptions, useStore } from "@/lib/store";
import { NotFound } from "../not-found";
import { AlbumActions } from "./album-client";

export function AlbumPage() {
  const id = useParams().id ?? "";
  const album = useStore(() => getAlbum(id), [id]);
  const albums = useStore(listAlbums);
  const trips = useStore(() => listTripOptions().map((t) => ({ id: t.id, title: t.name })));
  useTitle(album?.title ?? "Album");
  if (!album) return <NotFound />;
  return (
    <Container>
      <p className="text-sm text-ink-soft">
        <Link href="/albums" className="hover:text-pine hover:underline underline-offset-2">Photo Albums</Link>
      </p>
      <div className="flex flex-wrap items-end justify-between gap-4 mt-1 mb-8">
        <div>
          <h1 className="text-5xl">{album.title}</h1>
          <p className="text-ink-soft mt-2">
            {album.photos.length} {album.photos.length === 1 ? "photo" : "photos"}
            {album.tripName && (
              <>
                , from <Link href={`/trips/${album.tripId}`} className="text-pine hover:underline underline-offset-2">{album.tripName}</Link>
              </>
            )}
          </p>
          {album.description && <p className="mt-3 max-w-2xl font-display text-lg text-ink-soft">{album.description}</p>}
        </div>
        <AlbumActions album={{ id: album.id, title: album.title, description: album.description, tripId: album.tripId }} trips={trips} existing={album.photos.map((p) => p.id)} />
      </div>
      <PhotoGallery
        photos={album.photos}
        coverId={album.coverId}
        cover={{ type: "album", albumId: album.id }}
        reorder={{ type: "album", albumId: album.id }}
        removeFrom={{ type: "album", albumId: album.id }}
        upload={{ albumId: album.id, ...(album.tripId ? { tripId: album.tripId } : {}) }}
        albums={albums.filter((a) => a.id !== album.id).map((a) => ({ id: a.id, title: a.title }))}
        trips={trips}
      />
    </Container>
  );
}
