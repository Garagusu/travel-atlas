"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, ImageIcon, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { setCityCover, setStateCover } from "@/app/actions/cities";
import { detachPhotoFromEntry } from "@/app/actions/journal";
import {
  addPhotosToAlbum,
  createAlbum,
  deletePhotos,
  removePhotosFromAlbum,
  reorderAlbum,
  reorderCityPhotos,
  setAlbumCover,
} from "@/app/actions/photos";
import { addPhotosToTrip, setTripCover } from "@/app/actions/trips";
import { Dialog, useConfirm } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/action-result";
import { photoUrl } from "@/lib/constants";
import type { PhotoItem } from "@/lib/data";
import { Lightbox } from "./lightbox";
import { Uploader, type UploadTarget } from "./uploader";

export type CoverTarget =
  | { type: "city"; cityId: number }
  | { type: "trip"; tripId: string }
  | { type: "album"; albumId: string }
  | { type: "state"; code: string };

type Option = { id: string; title: string };

export function PhotoThumb({ p, className = "", sizes }: { p: PhotoItem; className?: string; sizes?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photoUrl(p.id, "thumb")}
      alt={p.caption ?? "Travel photo"}
      loading="lazy"
      decoding="async"
      width={p.width}
      height={p.height}
      sizes={sizes}
      className={`object-cover ${className}`}
      style={{ background: p.dominantColor ?? "var(--color-fog)" }}
    />
  );
}

function setCover(target: CoverTarget, photoId: string): Promise<ActionResult> {
  switch (target.type) {
    case "city":
      return setCityCover(target.cityId, photoId);
    case "trip":
      return setTripCover(target.tripId, photoId);
    case "album":
      return setAlbumCover(target.albumId, photoId);
    case "state":
      return setStateCover(target.code, photoId);
  }
}

export function PhotoGallery({
  photos: initial,
  coverId,
  cover,
  reorder,
  removeFrom,
  upload,
  albums,
  trips,
  emptyText = "No photos yet.",
  columns = "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
}: {
  photos: PhotoItem[];
  coverId?: string | null;
  cover?: CoverTarget;
  reorder?: { type: "city"; cityId: number } | { type: "album"; albumId: string };
  removeFrom?: { type: "album"; albumId: string } | { type: "entry"; entryId: string };
  upload?: UploadTarget;
  albums?: Option[];
  trips?: Option[];
  emptyText?: string;
  columns?: string;
}) {
  const [photos, setPhotos] = useState(initial);
  const [open, setOpen] = useState<number | null>(null);
  const [mode, setMode] = useState<"view" | "select" | "arrange">("view");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [albumDialog, setAlbumDialog] = useState(false);
  const [tripDialog, setTripDialog] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();

  // Server data wins whenever it changes (after uploads, refreshes…), except mid-arrange.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial && mode !== "arrange") {
    setSeen(initial);
    setPhotos(initial);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return toast(res.error, "error");
      toast(success);
      after?.();
      router.refresh();
    });

  const ids = useMemo(() => [...selected], [selected]);
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const exitSelect = () => {
    setMode("view");
    setSelected(new Set());
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setPhotos((list) => arrayMove(list, list.findIndex((p) => p.id === active.id), list.findIndex((p) => p.id === over.id)));
  };

  const saveOrder = () => {
    if (!reorder) return;
    const order = photos.map((p) => p.id);
    run(
      () => (reorder.type === "city" ? reorderCityPhotos(reorder.cityId, order) : reorderAlbum(reorder.albumId, order)),
      "New order saved",
      () => setMode("view"),
    );
  };

  const removeLabel = removeFrom?.type === "album" ? "Remove from album" : removeFrom?.type === "entry" ? "Remove from entry" : null;

  return (
    <div>
      {upload && (
        <div className="mb-4">
          <Uploader target={upload} compact={photos.length > 0} />
        </div>
      )}

      {photos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3 min-h-9">
          {mode === "view" && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => setMode("select")}>Select</button>
              {reorder && photos.length > 1 && (
                <button className="btn btn-secondary btn-sm" onClick={() => setMode("arrange")}>Arrange</button>
              )}
              <span className="text-sm text-ink-faint ml-1">{photos.length} {photos.length === 1 ? "photo" : "photos"}</span>
            </>
          )}
          {mode === "arrange" && (
            <>
              <span className="text-sm text-ink-soft mr-2">Drag photos into the order you like.</span>
              <button className="btn btn-primary btn-sm" disabled={pending} onClick={saveOrder}>{pending ? "Saving…" : "Save order"}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setPhotos(initial); setMode("view"); }}>Cancel</button>
            </>
          )}
          {mode === "select" && (
            <>
              <span className="text-sm text-ink-soft mr-1">{selected.size} selected</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set(selected.size === photos.length ? [] : photos.map((p) => p.id)))}>
                {selected.size === photos.length ? "Clear" : "Select all"}
              </button>
              <button className="btn btn-secondary btn-sm" disabled={!selected.size || pending} onClick={() => setAlbumDialog(true)}>Add to album</button>
              {trips && (
                <button className="btn btn-secondary btn-sm" disabled={!selected.size || pending} onClick={() => setTripDialog(true)}>Add to trip</button>
              )}
              {removeFrom && (
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={!selected.size || pending}
                  onClick={() =>
                    run(
                      async () => {
                        if (removeFrom.type === "album") return removePhotosFromAlbum(removeFrom.albumId, ids);
                        for (const id of ids) {
                          const r = await detachPhotoFromEntry(removeFrom.entryId, id);
                          if (!r.ok) return r;
                        }
                        return { ok: true as const };
                      },
                      `${ids.length === 1 ? "Photo" : "Photos"} removed`,
                      exitSelect,
                    )
                  }
                >
                  {removeLabel}
                </button>
              )}
              <button
                className="btn btn-danger btn-sm"
                disabled={!selected.size || pending}
                onClick={async () => {
                  const ok = await confirm({
                    title: `Delete ${ids.length === 1 ? "this photo" : `${ids.length} photos`}?`,
                    message: "They'll be removed from every city, trip, album and journal entry, and the files are deleted from storage. This can't be undone.",
                    confirmLabel: "Delete permanently",
                    danger: true,
                  });
                  if (ok) run(() => deletePhotos(ids), `${ids.length === 1 ? "Photo" : `${ids.length} photos`} deleted`, exitSelect);
                }}
              >
                Delete
              </button>
              <button className="btn btn-ghost btn-sm" onClick={exitSelect}>Done</button>
            </>
          )}
        </div>
      )}

      {photos.length === 0 ? (
        !upload && (
          <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong py-10 text-center text-sm text-ink-soft">
            <ImageIcon className="mx-auto mb-2 text-ink-faint" size={22} aria-hidden />
            {emptyText}
          </div>
        )
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={photos.map((p) => p.id)} strategy={rectSortingStrategy} disabled={mode !== "arrange"}>
            <ul className={`grid ${columns} gap-2 sm:gap-3`}>
              {photos.map((p, i) => (
                <Tile
                  key={p.id}
                  p={p}
                  isCover={coverId === p.id}
                  mode={mode}
                  selected={selected.has(p.id)}
                  onOpen={() => (mode === "select" ? toggle(p.id) : mode === "view" ? setOpen(i) : undefined)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {open !== null && (
        <Lightbox
          photos={photos}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
          onChanged={(np) => setPhotos((list) => list.map((x) => (x.id === np.id ? { ...x, ...np } : x)))}
          extraActions={(p) => (
            <>
              {cover && (
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={coverId === p.id || pending}
                  onClick={() => run(() => setCover(cover, p.id), "Cover photo updated")}
                >
                  <Star size={14} /> {coverId === p.id ? "Current cover" : "Set as cover"}
                </button>
              )}
              <button
                className="btn btn-danger btn-sm"
                disabled={pending}
                onClick={async () => {
                  const ok = await confirm({
                    title: "Delete this photo?",
                    message: "It will be removed everywhere it appears, and the file is deleted from storage.",
                    confirmLabel: "Delete permanently",
                    danger: true,
                  });
                  if (ok)
                    run(() => deletePhotos([p.id]), "Photo deleted", () => {
                      setPhotos((list) => list.filter((x) => x.id !== p.id));
                      setOpen((o) => (o === null ? null : photos.length <= 1 ? null : Math.min(o, photos.length - 2)));
                    });
                }}
              >
                Delete
              </button>
            </>
          )}
        />
      )}

      <AlbumPicker
        open={albumDialog}
        onClose={() => setAlbumDialog(false)}
        albums={albums ?? []}
        count={ids.length}
        onPick={(albumId, title) =>
          run(
            async () => (albumId ? addPhotosToAlbum(albumId, ids) : createAlbum({ title }, ids)),
            `Added to ${title}`,
            () => {
              setAlbumDialog(false);
              exitSelect();
            },
          )
        }
        pending={pending}
      />
      {trips && (
        <Dialog open={tripDialog} onClose={() => setTripDialog(false)} title="Add to a trip">
          {trips.length === 0 ? (
            <p className="text-ink-soft">You haven&apos;t created any trips yet.</p>
          ) : (
            <ul className="space-y-1">
              {trips.map((t) => (
                <li key={t.id}>
                  <button
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-fog disabled:opacity-60"
                    disabled={pending}
                    onClick={() => run(() => addPhotosToTrip(t.id, ids), `Added to ${t.title}`, () => { setTripDialog(false); exitSelect(); })}
                  >
                    {t.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Dialog>
      )}
    </div>
  );
}

function Tile({ p, isCover, mode, selected, onOpen }: { p: PhotoItem; isCover: boolean; mode: "view" | "select" | "arrange"; selected: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.id, disabled: mode !== "arrange" });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined };
  return (
    <li ref={setNodeRef} style={style} className={`relative group ${isDragging ? "opacity-80" : ""}`} {...(mode === "arrange" ? { ...attributes, ...listeners } : {})}>
      <button
        type="button"
        onClick={onOpen}
        className={`block w-full aspect-[4/3] overflow-hidden rounded-xl bg-fog ${mode === "arrange" ? "cursor-grab" : ""} ${
          selected ? "ring-[3px] ring-pine ring-offset-2 ring-offset-paper" : ""
        }`}
        aria-label={mode === "select" ? `${selected ? "Deselect" : "Select"} ${p.caption ?? "photo"}` : `Open ${p.caption ?? "photo"}`}
        aria-pressed={mode === "select" ? selected : undefined}
        tabIndex={mode === "arrange" ? -1 : 0}
      >
        <PhotoThumb p={p} className="w-full h-full transition-transform duration-300 group-hover:scale-[1.02]" />
      </button>
      {isCover && <span className="absolute top-2 left-2 rounded-full bg-card/95 text-[11px] font-semibold px-2 py-0.5 shadow-[var(--shadow-soft)]">Cover</span>}
      {mode === "select" && (
        <span className={`absolute top-2 right-2 h-6 w-6 rounded-full border-2 flex items-center justify-center pointer-events-none ${selected ? "bg-pine border-pine text-white" : "bg-card/80 border-white"}`}>
          {selected && <Check size={14} strokeWidth={3} />}
        </span>
      )}
      {mode === "arrange" && (
        <span className="absolute top-2 right-2 h-7 w-7 rounded-full bg-card/95 flex items-center justify-center pointer-events-none shadow-[var(--shadow-soft)]">
          <GripVertical size={14} />
        </span>
      )}
      {p.caption && mode === "view" && (
        <p className="mt-1.5 text-[13px] text-ink-soft truncate px-0.5">{p.caption}</p>
      )}
    </li>
  );
}

function AlbumPicker({
  open,
  onClose,
  albums,
  count,
  onPick,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  albums: Option[];
  count: number;
  onPick: (albumId: string | null, title: string) => void;
  pending: boolean;
}) {
  const [title, setTitle] = useState("");
  return (
    <Dialog open={open} onClose={onClose} title={`Add ${count === 1 ? "photo" : `${count} photos`} to an album`}>
      {albums.length > 0 && (
        <ul className="space-y-1 mb-5 max-h-64 overflow-y-auto">
          {albums.map((a) => (
            <li key={a.id}>
              <button className="w-full text-left px-3 py-2 rounded-lg hover:bg-fog disabled:opacity-60" disabled={pending} onClick={() => onPick(a.id, a.title)}>
                {a.title}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form noValidate
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) onPick(null, title.trim());
        }}
      >
        <input className="input" placeholder="New album, e.g. California Road Trip" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="New album title" />
        <button className="btn btn-primary shrink-0" disabled={!title.trim() || pending}>Create album</button>
      </form>
    </Dialog>
  );
}
