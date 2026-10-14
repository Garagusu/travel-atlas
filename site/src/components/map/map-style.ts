import type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec";

export const MAP_COLORS = {
  sea: "#eef2f1",
  land: "#fbfaf7",
  stateLine: "#cfc7b8",
  visitedFill: "#cfe4da",
  visitedLine: "#8fbcab",
  wantFill: "#f8e8c9",
  pine: "#2d6a5a",
  marigold: "#e2a33b",
  /** where photos were taken */
  photo: "#b4536a",
  neutralDot: "#9aa3a6",
  ink: "#1e2a30",
};

/**
 * Built-in atlas style: no external tiles or keys needed. State polygons and
 * city points are added as GeoJSON layers on top of a plain background.
 */
export function atlasStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [{ id: "background", type: "background", paint: { "background-color": MAP_COLORS.sea } }],
  };
}

/**
 * Street basemap. OpenFreeMap is free and needs no key; set the env variable to
 * another MapLibre style URL to change it, or to "none" for the plain atlas style.
 * If the basemap can't be loaded, maps fall back to the atlas style for the session.
 */
export const DEFAULT_BASEMAP = "https://tiles.openfreemap.org/styles/positron";
const configured = () => (import.meta.env.VITE_MAP_STYLE_URL as string | undefined)?.trim();
let basemapFailed = false;
export const markBasemapFailed = () => {
  basemapFailed = true;
};
export const basemapStyleUrl = () => {
  if (basemapFailed) return null;
  const v = configured();
  if (v === "none") return null;
  return v || DEFAULT_BASEMAP;
};
