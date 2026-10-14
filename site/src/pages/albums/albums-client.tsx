import { useRouter } from "@/lib/nav";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createAlbum, updateAlbum } from "@/lib/actions";
import { PhotoFilterBar } from "@/components/photos/photo-filter-bar";
import { PhotoGallery } from "@/components/photos/photo-gallery";
import { applyPhotoFilter, photoFilterOptions, type PhotoFilter } from "@/lib/photo-filter";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { allPhotos, useStore } from "@/lib/store";

type Option = { id: string; title: string };

export function AlbumFormDialog({
  open,
  onClose,
  trips,
  album,
}: {
  open: boolean;
  onClose: () => void;
  trips: Option[];
  album?: { id: string; title: string; description: string | null; tripId: string | null };
}) {
  const [v, setV] = useState({ title: album?.title ?? "", description: album?.description ?? "", tripId: album?.tripId ?? "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <Dialog open={open} onClose={onClose} title={album ? "Edit album" : "New album"}>
      <form noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            if (album) {
              const res = await updateAlbum(album.id, v);
              if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
              toast("Album saved");
              onClose();
              router.refresh();
            } else {
              const res = await createAlbum(v);
              if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
              toast(`${v.title} created`);
              router.push(`/albums/${res.data.id}`);
            }
          });
        }}
      >
        <div>
          <label className="label"
