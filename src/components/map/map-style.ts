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

export const basemapStyleUrl = () => process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim() || null;
