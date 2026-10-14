"use client";

import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, LngLatBoundsLike, Map as MLMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { atlasStyle, basemapStyleUrl, MAP_COLORS, markBasemapFailed } from "./map-style";
import type { StatesGeo } from "./types";

if (typeof window !== "undefined") maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export type MiniMarker = {
  id: string;
  lon: number;
  lat: number;
  label: string;
  kind: "city" | "place" | "stop" | "photo";
  status?: 0 | 1 | 2;
  n?: number;
};

let statesPromise: Promise<StatesGeo> | null = null;
const loadStates = () => (statesPromise ??= fetch("/geo/states.json").then((r) => r.json()));

/**
 * Small locator map: state outlines, nearby towns for context, and the given
 * markers. Optional route line for trip itineraries and click-to-pick for places.
 */
export function MiniMap({
  markers,
  route,
  nearby,
  onPick,
  pickLabel,
  highlightState,
  height = 320,
  zoom,
  center,
  className = "",
}: {
  center?: { lon: number; lat: number };
  markers: MiniMarker[];
  route?: boolean;
  nearby?: { lon: number; lat: number; name: string }[];
  onPick?: (p: { lon: number; lat: number }) => void;
  pickLabel?: string;
  highlightState?: string;
  height?: number;
  zoom?: number;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [styleFailed, setStyleFailed] = useState(false);
  const pickRef = useRef(onPick);
  useEffect(() => {
    pickRef.current = onPick;
  });

  useEffect(() => {
    if (!el.current) return;
    const styleUrl = styleFailed ? null : basemapStyleUrl();
    const map = new maplibregl.Map({
      container: el.current,
      style: styleUrl ?? atlasStyle(),
      center: markers[0] ? [markers[0].lon, markers[0].lat] : center ? [center.lon, center.lat] : [-98, 39],
      zoom: zoom ?? 9,
      attributionControl: false,
      dragRotate: false,
      cooperativeGestures: true,
      maxZoom: 16,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "US Census Bureau, GeoNames" }), "bottom-right");
    mapRef.current = map;
    map.on("load", async () => {
      const states = await loadStates().catch(() => null);
      if (states && !map.getSource("states")) {
        map.addSource("states", { type: "geojson", data: states });
        const firstSymbol = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
        map.addLayer(
          {
            id: "s-fill",
            type: "fill",
            source: "states",
            paint: {
              "fill-color": ["case", ["==", ["get", "code"], highlightState ?? ""], MAP_COLORS.land, "#f5f3ee"],
              "fill-opacity": styleUrl ? 0 : 1,
            },
          },
          firstSymbol,
        );
        map.addLayer({ id: "s-line", type: "line", source: "states", paint: { "line-color": MAP_COLORS.stateLine, "line-width": 1.2 } }, firstSymbol);
      }
      map.addSource("route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "route",
        type: "line",
        source: "route",
        paint: { "line-color": MAP_COLORS.pine, "line-width": 2.2, "line-dasharray": [2, 1.6], "line-opacity": 0.8 },
      });
      map.addSource("nearby", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "nearby",
        type: "circle",
        source: "nearby",
        paint: { "circle-color": MAP_COLORS.neutralDot, "circle-radius": 2.6, "circle-stroke-color": "#fff", "circle-stroke-width": 1 },
        layout: { visibility: styleUrl ? "none" : "visible" },
      });
      setReady(true);
    });
    map.on("error", () => {
      if (styleUrl && !map.isStyleLoaded()) {
        markBasemapFailed();
        setStyleFailed(true);
      }
    });
    map.on("click", (e) => pickRef.current?.({ lon: e.lngLat.lng, lat: e.lngLat.lat }));
    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleFailed]);

  useEffect(() => {
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = onPick ? "crosshair" : "";
  }, [onPick, ready]);

  /* nearby towns for context */
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !nearby) return;
    (map.getSource("nearby") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: nearby.map((c) => ({ type: "Feature", geometry: { type: "Point", coordinates: [c.lon, c.lat] }, properties: {} })),
    });
    const ms = basemapStyleUrl()
      ? []
      : nearby.slice(0, 12).map((c) => {
          const d = document.createElement("div");
          d.className = "tj-state-label";
          d.style.fontSize = "11.5px";
          d.textContent = c.name;
          return new maplibregl.Marker({ element: d, anchor: "left", offset: [6, 0] }).setLngLat([c.lon, c.lat]).addTo(map);
        });
    return () => ms.forEach((m) => m.remove());
  }, [ready, nearby]);

  /* markers, route and framing */
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const created = markers.map((m) => {
      const node = document.createElement("div");
      node.className = "flex items-center gap-1.5 pointer-events-none";
      const dot = document.createElement("span");
      if (m.kind === "stop") {
        dot.className = "h-6 w-6 rounded-full bg-ink text-white text-[11px] font-semibold flex items-center justify-center ring-2 ring-white shadow";
        dot.textContent = String(m.n ?? "");
      } else if (m.kind === "place") {
        dot.className = "h-3 w-3 rounded-full ring-2 ring-white shadow";
        dot.style.background = MAP_COLORS.marigold;
      } else if (m.kind === "photo") {
        dot.className = "h-3 w-3 rounded-full ring-2 ring-white shadow";
        dot.style.background = MAP_COLORS.photo;
      } else {
        dot.className = "h-4 w-4 rounded-full ring-[3px] ring-white shadow";
        dot.style.background = m.status === 2 ? MAP_COLORS.pine : m.status === 1 ? MAP_COLORS.marigold : MAP_COLORS.ink;
      }
      const label = document.createElement("span");
      label.className = "tj-city-label text-ink";
      label.style.fontSize = m.kind === "place" ? "11px" : "12.5px";
      label.textContent = m.label;
      node.append(dot);
      if (m.label) node.append(label);
      return new maplibregl.Marker({ element: node, anchor: "left", offset: [-8, 0] }).setLngLat([m.lon, m.lat]).addTo(map);
    });

    (map.getSource("route") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features:
        route && markers.length > 1
          ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: markers.map((m) => [m.lon, m.lat]) } }]
          : [],
    });

    if (markers.length > 1) {
      const lons = markers.map((m) => m.lon);
      const lats = markers.map((m) => m.lat);
      const b: LngLatBoundsLike = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
      map.fitBounds(b, { padding: { top: 50, bottom: 40, left: 40, right: 110 }, maxZoom: zoom ?? 12, duration: 0 });
    } else if (markers.length === 1 && !onPick) {
      map.jumpTo({ center: [markers[0].lon, markers[0].lat], zoom: zoom ?? 9 });
    }
    return () => created.forEach((m) => m.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onPick only matters for the initial framing
  }, [ready, markers, route, zoom]);

  return (
    <div className={`relative overflow-hidden rounded-[var(--radius-card)] border border-line ${className}`} style={{ height }}>
      <div ref={el} style={{ position: "absolute", inset: 0 }} aria-label="Location map" role="region" />
      {!ready && <div className="absolute inset-0 bg-[#eef2f1] flex items-center justify-center text-sm text-ink-soft">Loading map…</div>}
      {onPick && pickLabel && (
        <div className="absolute top-2 left-2 rounded-lg bg-ink text-white text-xs px-2.5 py-1.5 shadow">{pickLabel}</div>
      )}
    </div>
  );
}
