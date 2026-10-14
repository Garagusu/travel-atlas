import { ExternalLink, MapPin } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { setPhotoLocation } from "@/lib/actions";
import { MiniMap, type MiniMarker } from "@/components/map/mini-map";
import { useToast } from "@/components/ui/toast";
import { cityById } from "@/lib/store";
import type { PhotoItem } from "@/lib/types";
import { mapsUrl, reverseGeocode } from "@/lib/places-util";

type LatLon = { lat: number; lon: number };

/** "Where" section of the photo viewer: map, place name, and setting the spot by hand. */
export function PhotoLocation({ photo, onChanged }: { photo: PhotoItem; onChanged?: (p: PhotoItem) => void }) {
  const [picking, setPicking] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();

  // a different photo resets the section
  const [seen, setSeen] = useState(photo.id);
  if (seen !== photo.id) {
    setSeen(photo.id);
    setPicking(false);
    setConfirmRemove(false);
  }

  const has = photo.lat != null && photo.lon != null;

  const save = (loc: LatLon | null) =>
    start(async () => {
      const res = await setPhotoLocation(photo.id, loc);
      if (!res.ok) return toast(res.error, "error");
      const filed = res.data.cityName && res.data.cityId !== photo.cityId;
      toast(loc ? (filed ? `Location saved, filed under ${res.data.cityName}` : "Location saved") : "Location removed");
      setPicking(false);
      setConfirmRemove(false);
      onChanged?.({
        ...photo,
        lat: loc?.lat ?? null,
        lon: loc?.lon ?? null,
        ...(filed ? { cityId: res.data.cityId, cityName: res.data.cityName, stateCode: res.data.stateCode } : {}),
      });
    });

  return (
    <section className="mt-6 pt-5 border-t border-line" aria-labelledby="ph-where">
      <h3 id="ph-where" className="text-sm font-semibold flex items-center gap-1.5 mb-2">
        <MapPin size={14} className="text-[#b4536a]" aria-hidden /> Where it was taken
      </h3>
      {picking ? (
        <LocationPicker photo={photo} pending={pending} onSave={save} onCancel={() => setPicking(false)} />
      ) : has ? (
        <ShownLocation lat={photo.lat!} lon={photo.lon!} photoId={photo.id}>
          <div className="mt-2 flex flex-wrap gap-2">
            <a className="btn btn-secondary btn-sm" href={mapsUrl({ name: "", lat: photo.lat, lon: photo.lon })} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} aria-hidden /> Open in Maps
            </a>
            <button className="btn btn-ghost btn-sm" onClick={() => setPicking(true)}>Change</button>
            {confirmRemove ? (
              <span className="flex items-center gap-1.5 text-sm">
                Remove the location?
                <button className="btn btn-danger btn-sm" disabled={pending} onClick={() => save(null)}>Remove</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setConfirmRemove(false)}>Keep</button>
              </span>
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmRemove(true)}>Remove</button>
            )}
          </div>
        </ShownLocation>
      ) : (
        <div>
          <p className="text-sm text-ink-soft">No location saved for this photo. Photos taken with location services on get one automatically.</p>
          <button className="btn btn-secondary btn-sm mt-2" onClick={() => setPicking(true)}>Add location</button>
        </div>
      )}
    </section>
  );
}

function ShownLocation({ lat, lon, photoId, children }: LatLon & { photoId: string; children: React.ReactNode }) {
  const [name, setName] = useState<{ key: string; text: string | null } | null>(null);
  const key = `${lat},${lon}`;
  useEffect(() => {
    const ctl = new AbortController();
    // wait a moment so arrowing quickly through photos doesn't fire a lookup for each
    const t = setTimeout(() => {
      reverseGeocode(lat, lon, ctl.signal)
        .then((text) => setName({ key, text }))
        .catch(() => {});
    }, 350);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [lat, lon, key]);
  const markers = useMemo<MiniMarker[]>(() => [{ id: photoId, lat, lon, label: "", kind: "photo" }], [photoId, lat, lon]);
  const label = name?.key === key ? name.text : undefined;
  return (
    <div>
      <MiniMap markers={markers} height={170} zoom={13.5} />
      <p className="mt-2 text-sm">
        {label === undefined ? <span className="text-ink-faint">Finding the place name…</span> : label ?? <span className="text-ink-soft">Unnamed spot</span>}
      </p>
      <p className="text-xs text-ink-faint tabular-nums">
        {Math.abs(lat).toFixed(5)}° {lat >= 0 ? "N" : "S"}, {Math.abs(lon).toFixed(5)}° {lon >= 0 ? "E" : "W"}
      </p>
      {children}
    </div>
  );
}

function LocationPicker({
  photo,
  pending,
  onSave,
  onCancel,
}: {
  photo: PhotoItem;
  pending: boolean;
  onSave: (loc: LatLon) => void;
  onCancel: () => void;
}) {
  const [picked, setPicked] = useState<LatLon | null>(photo.lat != null && photo.lon != null ? { lat: photo.lat, lon: photo.lon } : null);
  // start the map on the photo's spot, else its city, else the whole country
  const [start] = useState<{ center: LatLon; zoom: number }>(() => {
    if (picked) return { center: picked, zoom: 13 };
    const c = photo.cityId ? cityById(photo.cityId) : null;
    return c ? { center: { lat: c.lat, lon: c.lon }, zoom: 11.5 } : { center: { lat: 39, lon: -98 }, zoom: 3 };
  });

  const markers = useMemo<MiniMarker[]>(() => (picked ? [{ id: "pick", lat: picked.lat, lon: picked.lon, label: "", kind: "photo" }] : []), [picked]);

  return (
    <div>
      <MiniMap
        markers={markers}
        center={start.center}
        zoom={start.zoom}
        height={240}
        onPick={(p) => setPicked({ lat: p.lat, lon: p.lon })}
        pickLabel={picked ? "Click again to move the pin" : "Click where you took this photo"}
      />
      <div className="mt-2 flex gap-2">
        <button className="btn btn-primary btn-sm" disabled={!picked || pending} onClick={() => picked && onSave(picked)}>
          {pending ? "Saving…" : "Save location"}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
