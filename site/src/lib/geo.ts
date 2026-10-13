import { geoMercator, geoPath } from "d3-geo";
import { useEffect, useState } from "react";
import type { StatesGeo } from "@/components/map/types";

let p: Promise<StatesGeo> | null = null;
export const loadStatesGeo = () =>
  (p ??= fetch(new URL("data/states.json", document.baseURI)).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }));

export function useStatesGeo() {
  const [geo, setGeo] = useState<StatesGeo | null>(null);
  useEffect(() => {
    loadStatesGeo().then(setGeo).catch(() => setGeo(null));
  }, []);
  return geo;
}

/** SVG outline of a state plus a projector for placing city dots on it. */
export function stateOutline(geo: StatesGeo, code: string, width = 360, height = 260) {
  const f = geo.features.find((x) => x.properties.code === code);
  if (!f) return null;
  const projection = geoMercator();
  if (code === "AK") projection.rotate([152, 0]);
  projection.fitExtent([[8, 8], [width - 8, height - 8]], f);
  return {
    path: geoPath(projection)(f) ?? "",
    width,
    height,
    project: (lon: number, lat: number) => {
      const pt = projection([lon, lat]);
      return pt ? { x: pt[0], y: pt[1] } : null;
    },
  };
}
