import { Camera } from "lucide-react";
import Link from "next/link";
import { StatusBadge, type Status } from "@/components/status-control";
import { formatDate } from "@/components/ui/format";
import { StarRating } from "@/components/ui/star-rating";
import { photoUrl } from "@/lib/constants";
import { stateName } from "@/lib/geo/states-meta";

export function CityCard({
  c,
}: {
  c: {
    id: number;
    name: string;
    stateCode: string;
    stateName?: string;
    status: Status;
    visitedOn?: string | null;
    rating?: number | null;
    tags?: string[];
    cover: string | null;
    photoCount?: number;
    impression?: string | null;
  };
}) {
  return (
    <Link href={`/cities/${c.id}`} className="group block card overflow-hidden hover:shadow-[var(--shadow-lift)] transition-shadow">
      <div className="aspect-[16/10] bg-fog relative overflow-hidden">
        {c.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl(c.cover)} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center font-display italic text-5xl text-line-strong select-none">{c.stateCode}</div>
        )}
        {!!c.photoCount && (
          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-card/95 text-xs px-2 py-0.5">
            <Camera size={11} aria-hidden /> {c.photoCount}
          </span>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-display text-xl leading-tight truncate group-hover:text-pine">{c.name}</p>
            <p className="text-sm text-ink-soft">{c.stateName ?? stateName(c.stateCode)}</p>
          </div>
          <StatusBadge status={c.status} />
        </div>
        {c.impression && <p className="mt-2 text-sm text-ink-soft line-clamp-2 italic font-display">{c.impression}</p>}
        <div className="mt-2 flex items-center gap-3 flex-wrap">
          {c.visitedOn && <span className="text-xs text-ink-faint">{formatDate(c.visitedOn)}</span>}
          <StarRating value={c.rating ?? null} readOnly size={12} />
        </div>
        {!!c.tags?.length && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {c.tags.slice(0, 4).map((t) => (
              <span key={t} className="text-[11px] rounded-full bg-fog px-2 py-0.5 text-ink-soft">{t}</span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
