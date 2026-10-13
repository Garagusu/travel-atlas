import { STATES } from "@/lib/geo/states-meta";

/** Tile map with a trip's states filled in — the cover for trips without photos. */
export function TripStatesMark({ codes }: { codes: string[] }) {
  const on = new Set(codes);
  return (
    <svg viewBox="-0.5 -0.5 14 9" className="w-full h-full" role="img" aria-label={codes.length ? `States on this trip: ${codes.join(", ")}` : "No stops yet"}>
      {STATES.map((s) => (
        <rect
          key={s.code}
          x={s.tile[0] + 0.07}
          y={s.tile[1] + 0.07}
          width={0.86}
          height={0.86}
          rx={0.16}
          fill={on.has(s.code) ? "#2d6a5a" : "#e6e1d8"}
        />
      ))}
    </svg>
  );
}
