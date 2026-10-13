import { STATES } from "@/lib/states-meta";

/** Decorative tile map used on the sign-in screen. */
export function TileGridMark() {
  const visited = new Set(["CA", "OR", "WA", "NV", "AZ", "UT", "CO", "NY", "MA", "ME", "VT", "IL", "TX", "FL", "HI"]);
  const wanted = new Set(["AK", "MT", "WY", "NM", "LA", "TN", "GA"]);
  return (
    <svg viewBox="0 0 13 8" className="w-full max-w-md" aria-hidden>
      {STATES.map((s) => (
        <rect
          key={s.code}
          x={s.tile[0] + 0.06}
          y={s.tile[1] + 0.06}
          width={0.88}
          height={0.88}
          rx={0.16}
          fill={visited.has(s.code) ? "#2d6a5a" : wanted.has(s.code) ? "#e2a33b" : "#dfe6e1"}
        />
      ))}
    </svg>
  );
}
