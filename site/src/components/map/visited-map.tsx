import { useRouter } from "@/lib/nav";
import { useMemo } from "react";
import { USMap } from "./us-map";
import { useAtlasData } from "./use-atlas-data";

/** Compact map of the cities you've visited or want to visit; clicks open pages. */
export function VisitedMap({ height = 380 }: { height?: number }) {
  const data = useAtlasData({ withBaseCities: false });
  const router = useRouter();
  const filter = useMemo(() => ({ visited: true, want: true, none: false }), []);
  return (
    <div className="relative rounded-[var(--radius-card)] overflow-hidden border border-line bg-[#eef2f1]" style={{ height }}>
      {data.statesGeo ? (
        <USMap
          compact
          className="absolute inset-0"
          statesGeo={data.statesGeo}
          baseCities={null}
          mine={data.mine}
          stateStatus={data.stateStatus}
          filter={filter}
          onCityClick={(c) => router.push(`/cities/${c.id}`)}
          onStateClick={(code) => router.push(`/states/${code}`)}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-soft">{data.error ?? "Loading map…"}</div>
      )}
    </div>
  );
}
