import { Link } from "@/lib/nav";
import { STATES } from "@/lib/states-meta";

export type TileStatus = { code: string; visited: number; wanted: number };

/**
 * The 50 states (+DC) as a tile map. Each tile shows whether you've visited
 * (pine), want to visit (marigold), or not been yet.
 */
export function TileGrid({
  statuses,
  selected,
  onSelect,
  hrefPrefix,
  size = "md",
}: {
  statuses: TileStatus[];
  selected?: string | null;
  onSelect?: (code: string) => void;
  /** When set, tiles are links to `${hrefPrefix}${code}` (usable from server components). */
  hrefPrefix?: string;
  size?: "sm" | "md";
}) {
  const byCode = new Map(statuses.map((s) => [s.code, s]));
  return (
    <div
      className="grid gap-[3px]"
      style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))", gridTemplateRows: "repeat(8, auto)" }}
    >
      {STATES.map((s) => {
        const st = byCode.get(s.code);
        const kind = st?.visited ? "visited" : st?.wanted ? "want" : "none";
        const label = `${s.name}: ${
          st?.visited ? `${st.visited} ${st.visited === 1 ? "city" : "cities"} visited` : st?.wanted ? "on your wishlist" : "not visited yet"
        }`;
        const cls = `aspect-square flex items-center justify-center rounded-[5px] font-semibold leading-none transition-colors ${
          size === "sm" ? "text-[8px]" : "text-[9.5px] sm:text-[10px]"
        } ${
          kind === "visited"
            ? "bg-pine text-white hover:bg-pine-deep"
            : kind === "want"
              ? "bg-marigold-bright text-ink hover:bg-marigold"
              : "bg-fog text-ink-faint hover:bg-line-strong hover:text-ink"
        } ${selected === s.code ? "ring-2 ring-ink ring-offset-1 ring-offset-paper" : ""} ${s.isState ? "" : "opacity-80"}`;
        const style = { gridColumn: s.tile[0] + 1, gridRow: s.tile[1] + 1 };
        if (hrefPrefix)
          return (
            <Link key={s.code} href={`${hrefPrefix}${s.code}`} className={cls} style={style} aria-label={label} title={label}>
              {s.code}
            </Link>
          );
        return (
          <button key={s.code} type="button" className={cls} style={style} aria-label={label} title={label} aria-pressed={selected === s.code} onClick={() => onSelect?.(s.code)}>
            {s.code}
          </button>
        );
      })}
    </div>
  );
}
