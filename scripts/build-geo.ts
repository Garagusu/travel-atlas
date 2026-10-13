/**
 * Generates public/geo/states.json (GeoJSON) from the us-atlas package.
 * Run with: npm run geo:build
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { geoArea, geoCentroid } from "d3-geo";
import type { Feature, Polygon } from "geojson";
import { statesFeatureCollection } from "../src/lib/geo/boundaries";

const require = createRequire(import.meta.url);
const topology = require("us-atlas/states-10m.json");
const fc = statesFeatureCollection(topology);

// Label point: centroid of the largest polygon (keeps MI, HI, FL labels on land)
for (const f of fc.features) {
  const polys: Polygon[] =
    f.geometry.type === "Polygon"
      ? [f.geometry]
      : f.geometry.coordinates.map((coordinates) => ({ type: "Polygon", coordinates }));
  const largest = polys
    .map((g) => ({ g, a: geoArea({ type: "Feature", geometry: g, properties: {} } as Feature<Polygon>) }))
    .sort((x, y) => y.a - x.a)[0].g;
  const [lon, lat] = geoCentroid({ type: "Feature", geometry: largest, properties: {} } as Feature<Polygon>);
  Object.assign(f.properties, { labelLon: Math.round(lon * 1e3) / 1e3, labelLat: Math.round(lat * 1e3) / 1e3 });
}

// round coordinates to ~10 m to keep the file small
const round = (v: unknown): unknown => (Array.isArray(v) ? v.map(round) : Math.round((v as number) * 1e4) / 1e4);
for (const f of fc.features) (f.geometry as { coordinates: unknown }).coordinates = round(f.geometry.coordinates);

mkdirSync("public/geo", { recursive: true });
writeFileSync("public/geo/states.json", JSON.stringify(fc));
console.log(`wrote ${fc.features.length} state features`);
