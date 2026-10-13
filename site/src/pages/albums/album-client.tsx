import { useRouter } from "@/lib/nav";
import { useState, useTransition } from "react";
import { addPhotosToAlbum, deleteAlbum } from "@/lib/actions";
import { PhotoPicker } from "@/components/photos/photo-picker";
import { useConfirm } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { AlbumFormDialog } from "./albums-client";

export function AlbumActions({
  album,
  trips,
  existing,
}: {
  album: { id: string; title: string; description: string | null; tripId: string | null };
  trips: { id: string; title: string }[];
  existing: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pending, start] = useTransition();
  const confirm = useConfirm();
  const toast = useToast();
  const router = useRouter();
  return (
    <div className="flex flex-wrap gap-2">
      <button className="btn btn-secondary" onClick={() => setPicking(true)}>Add from library</button>
      <button className="btn btn-secondary" onClick={() => setEditing(true)}>Edit album</button>
      <button
        className="btn btn-danger"
        disabled={pending}
        onClick={async () => {
          const ok = await confirm({
            title: `Delete ${album.title}?`,
            message: "Only the album is deleted. Its photos stay in your library and on their city pages.",
            confirmLabel: "Delete album",
            danger: true,
          });
          if (ok) start(async () => { const r = await deleteAlbum(album.id); if (r.ok) router.push("/albums"); });
        }}
      >
        Delete
      </button>
      {editing && <AlbumFormDialog open onClose={() => setEditing(false)} trips={trips} album={album} />}
      <PhotoPicker
        open={picking}
        onClose={() => setPicking(false)}
        exclude={existing}
        title={`Add photos to ${album.title}`}
        onDone={(ids) =>
          start(async () => {
            const res = await addPhotosToAlbum(album.id, ids);
            if (!res.ok) return toast(res.error, "error");
            toast(`${ids.length} ${ids.length === 1 ? "photo" : "photos"} added`);
            setPicking(false);
            router.refresh();
          })
        }
      />
    </div>
  );
}
