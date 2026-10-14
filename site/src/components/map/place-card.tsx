import { ExternalLink, Heart, Share2, X } from "lucide-react";
import { Link } from "@/lib/nav";
import { useToast } from "@/components/ui/toast";
import { PLACE_CATEGORY_LABEL } from "@/lib/constants";
import { stateName } from "@/lib/states-meta";
import { CATEGORY_COLORS, mapsUrl, recommendationText, shareText, type PlaceCategoryKey } from "@/lib/places-util";
import type { MapPlace } from "./types";

/** Popup content for a saved place on the map. */
export function PlaceCard({ place, onClose }: { place: MapPlace; onClose: () => void }) {
  const toast = useToast();
  const cat = place.category as PlaceCategoryKey;
  const label = PLACE_CATEGORY_LABEL[cat] ?? "Place";
  return (
    <div className="w-[260px]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: CATEGORY_COLORS[cat] }}>
            <span className="h-2 w-2 rounded-full" style={{ background: CATEGORY_COLORS[cat] }} aria-hidden />
            {label}
            {place.favorite && <Heart size={11} className="fill-danger text-danger" aria-label="Favorite" />}
          </p>
          <p className="font-display text-xl leading-tight mt-0.5">{place.name}</p>
          <p className="text-sm text-ink-soft">
            <Link href={`/cities/${place.cityId}`} className="hover:text-pine hover:underline underline-offset-2">{place.cityName}</Link>, {stateName(place.stateCode)}
          </p>
        </div>
        <button className="text-ink-faint hover:text-ink -mr-1" aria-label="Close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      {place.address && <p className="text-xs text-ink-faint mt-1">{place.address}</p>}
      {place.notes && <p className="text-sm mt-2">{place.notes}</p>}
      <div className="mt-3 flex gap-2">
        <a href={mapsUrl(place)} target="_blank" rel="noreferrer noopener" className="btn btn-primary btn-sm">
          <ExternalLink size={13} /> Open in Maps
        </a>
        <button
          className="btn btn-secondary btn-sm"
          onClick={async () => {
            const title = `${place.name} in ${place.cityName}`;
            try {
              const r = await shareText(title, recommendationText(title, [{ ...place, categoryLabel: label }]));
              if (r === "copied") toast("Copied — paste it into a message");
            } catch {
              toast("Couldn't share or copy on this device", "error");
            }
          }}
        >
          <Share2 size={13} /> Share
        </button>
      </div>
    </div>
  );
}
