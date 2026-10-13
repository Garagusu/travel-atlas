import "server-only";
import { createRequire } from "node:module";
import { geoMercator, geoPath } from "d3-geo";
import type { Topology } from "topojson-specification";
import { statesFeatureCollection, type StateFeature } from "./boundaries";

const require = createRequire(import.meta.url);
let features: Map<string, StateFeature> | undefined;

function stateFeature(code: string) {
  if (!features) {
    const fc = statesFeatureCollection(require("us-atlas/states-10m.json") as Topology);
    features = new Map(fc.features.map((f) => [f.properties.code, f]));
  }
  return features.get(code);
}

/** SVG outline of a state plus a projector for placing city dots on it. */
export function stateOutline(code: string, width = 320, height = 240) {
  const f = stateFeature(code);
  if (!f) return null;
  const projection = geoMercator();
  if (code === "AK") projection.rotate([152, 0]);
  projection.fitExtent([[8, 8], [width - 8, height - 8]], f);
  const path = geoPath(projection)(f) ?? "";
  return {
    path,
    width,
    height,
    project: (lon: number, lat: number) => {
      const p = projection([lon, lat]);
      return p ? { x: Math.round(p[0] * 10) / 10, y: Math.round(p[1] * 10) / 10 } : null;
    },
  };
}
