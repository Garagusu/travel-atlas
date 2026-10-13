import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { STATE_BY_FIPS } from "./states-meta";

export type StateFeature = Feature<Polygon | MultiPolygon, { fips: string; code: string; name: string }>;

/**
 * Converts the US Census Bureau state boundaries (via us-atlas, 1:10m) to
 * GeoJSON, keeping the 50 states + DC and dropping the territories.
 */
export function statesFeatureCollection(topology: Topology): FeatureCollection<Polygon | MultiPolygon, StateFeature["properties"]> {
  const obj = topology.objects.states as GeometryCollection<{ name: string }>;
  const fc = feature(topology, obj) as unknown as FeatureCollection<Polygon | MultiPolygon, { name: string }>;
  const features: StateFeature[] = [];
  for (const f of fc.features) {
    const meta = STATE_BY_FIPS.get(String(f.id));
    if (!meta) continue;
    features.push({
      type: "Feature",
      id: Number(meta.fips),
      geometry: f.geometry,
      properties: { fips: meta.fips, code: meta.code, name: meta.name },
    });
  }
  return { type: "FeatureCollection", features };
}
