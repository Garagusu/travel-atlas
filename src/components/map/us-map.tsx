"use client";

import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, LngLatBoundsLike, Map as MLMap, MapGeoJSONFeature, MapMouseEvent } from "maplibre-gl";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { REGION_VIEWS, STATE_BY_CODE } from "@/lib/geo/states-meta";
import { atlasStyle, basemapStyleUrl, MAP_COLORS } from "./map-style";
import type { BaseCities, CityPick, MyCity, StateStatus, StatesGeo, StatusCode, StatusFilter } from "./types";

// MapLibre's worker can't be resolved from inside the bundle; it is copied to /public on install.
if (typeof window !== "undefined") maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export type USMapHandle = {
  flyToCity: (c: { lon: number; lat: number }, zoom?: number) => void;
  fitState: (code: string) => void;
  fitRegion: (r: keyof typeof REGION_VIEWS) => void;
  map: () => MLMap | null;
};

type Props = {
  statesGeo: StatesGeo;
  baseCities: BaseCities | null;
  mine: MyCity[];
  stateStatus: StateStatus[];
  filter: StatusFilter;
  selectedState?: string | null;
  compact?: boolean;
  onCityClick?: (c: CityPick) => void;
  onStateClick?: (code: string) => void;
  onReady?: () => void;
  className?: string;
};

const CITY_LAYERS_BASE = [
  { id: "city-t1", min: 300_000, max: Infinity, minzoom: 0 },
  { id: "city-t2", min: 75_000, max: 300_000, minzoom: 4.6 },
  { id: "city-t3", min: 20_000, max: 75_000, minzoom: 5.6 },
  { id: "city-t4", min: 5_000, max: 20_000, minzoom: 6.8 },
  { id: "city-t5", min: 0, max: 5_000, minzoom: 8 },
];
const MINE_LAYERS = ["mine-none", "mine-want", "mine-visited"];
const INTERACTIVE_CITY_LAYERS = [...MINE_LAYERS, ...CITY_LAYERS_BASE.map((l) => l.id)].reverse();

type Hover = { x: number; y: number; title: string; sub?: string } | null;

function boundsFor(code: string, geo: StatesGeo): LngLatBoundsLike | null {
  if (code === "AK") return REGION_VIEWS.alaska.bounds as LngLatBoundsLike;
  const f = geo.features.find((x) => x.properties.code === code);
  if (!f) return null;
  let w = 180, s = 90, e = -180, n = -90;
  const walk = (c: unknown): void => {
    if (typeof (c as number[])[0] === "number") {
      const [x, y] = c as number[];
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    } else (c as unknown[]).forEach(walk);
  };
  walk(f.geometry.coordinates);
  return [w, s, e, n];
}

export const USMap = forwardRef<USMapHandle, Props>(function USMap(
  { statesGeo, baseCities, mine, stateStatus, filter, selectedState, compact, onCityClick, onStateClick, onReady, className },
  ref,
) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [hover, setHover] = useState<Hover>(null);
  const [styleError, setStyleError] = useState(false);
  const callbacks = useRef({ onCityClick, onStateClick });
  useEffect(() => {
    callbacks.current = { onCityClick, onStateClick };
  });
  const usingBasemap = !!basemapStyleUrl() && !styleError;

  const fipsByCode = useMemo(() => new Map(statesGeo.features.map((f) => [f.properties.code, Number(f.properties.fips)])), [statesGeo]);

  useImperativeHandle(ref, () => ({
    flyToCity: (c, zoom = 9) => mapRef.current?.flyTo({ center: [c.lon, c.lat], zoom, speed: 1.6, essential: true }),
    fitState: (code) => {
      const b = boundsFor(code, statesGeo);
      if (b) mapRef.current?.fitBounds(b, { padding: compact ? 24 : 60, maxZoom: 7.5, duration: 900 });
    },
    fitRegion: (r) => mapRef.current?.fitBounds(REGION_VIEWS[r].bounds as LngLatBoundsLike, { padding: 30, duration: 900 }),
    map: () => mapRef.current,
  }));

  /* ---------------- create the map once ---------------- */
  useEffect(() => {
    if (!container.current) return;
    const styleUrl = usingBasemap ? basemapStyleUrl()! : null;
    const map = new maplibregl.Map({
      container: container.current,
      style: styleUrl ?? atlasStyle(),
      bounds: REGION_VIEWS.lower48.bounds as LngLatBoundsLike,
      fitBoundsOptions: { padding: compact || container.current.clientWidth < 640 ? 8 : 40 },
      minZoom: 1.5,
      maxZoom: 14,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: false,
      cooperativeGestures: compact,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: "Boundaries: US Census Bureau. Cities: GeoNames (CC BY 4.0)",
      }),
      "bottom-right",
    );
    if (!compact) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    mapRef.current = map;

    let fellBack = false;
    map.on("error", (e) => {
      // If the external basemap can't load, fall back to the built-in style.
      if (styleUrl && !map.isStyleLoaded() && !fellBack) {
        fellBack = true;
        console.warn("Basemap style failed to load; using built-in atlas style", e.error);
        setStyleError(true);
      }
    });

    map.on("load", () => {
      const firstSymbol = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
      map.addSource("states", { type: "geojson", data: statesGeo });
      map.addLayer(
        {
          id: "states-fill",
          type: "fill",
          source: "states",
          paint: {
            "fill-color": [
              "match",
              ["coalesce", ["feature-state", "status"], 0],
              2, MAP_COLORS.visitedFill,
              1, MAP_COLORS.wantFill,
              MAP_COLORS.land,
            ],
            "fill-opacity": styleUrl ? ["match", ["coalesce", ["feature-state", "status"], 0], 0, 0, 0.6] : 1,
          },
        },
        firstSymbol,
      );
      map.addLayer(
        {
          id: "states-line",
          type: "line",
          source: "states",
          paint: { "line-color": MAP_COLORS.stateLine, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.6, 7, 1.4] },
        },
        firstSymbol,
      );
      map.addLayer({
        id: "states-hover",
        type: "line",
        source: "states",
        paint: {
          "line-color": MAP_COLORS.ink,
          "line-width": 1.6,
          "line-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.9, ["boolean", ["feature-state", "hover"], false], 0.45, 0],
        },
      });

      map.addSource("cities", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      for (const t of CITY_LAYERS_BASE) {
        map.addLayer({
          id: t.id,
          type: "circle",
          source: "cities",
          minzoom: t.minzoom,
          filter: ["all", [">=", ["get", "p"], t.min], ["<", ["get", "p"], t.max === Infinity ? 1e12 : t.max]],
          paint: {
            "circle-color": MAP_COLORS.neutralDot,
            "circle-opacity": 0.9,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, t.min >= 300_000 ? 2.6 : 1.8, 7, 3, 11, 4.6],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 3, 0.4, 8, 1],
          },
        });
      }
      map.addSource("mine", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      const mineLayer = (id: string, s: number, color: string, r: [number, number]) =>
        map.addLayer({
          id,
          type: "circle",
          source: "mine",
          filter: ["==", ["get", "s"], s],
          paint: {
            "circle-color": color,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, r[0], 9, r[1]],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.6,
          },
        });
      mineLayer("mine-none", 0, MAP_COLORS.neutralDot, [2.4, 5]);
      mineLayer("mine-want", 1, MAP_COLORS.marigold, [4, 7.5]);
      mineLayer("mine-visited", 2, MAP_COLORS.pine, [4.6, 8.5]);

      /* ---------- interaction ---------- */
      let hoveredState: number | null = null;
      const setStateHover = (id: number | null) => {
        if (hoveredState !== null) map.setFeatureState({ source: "states", id: hoveredState }, { hover: false });
        hoveredState = id;
        if (id !== null) map.setFeatureState({ source: "states", id }, { hover: true });
      };
      const cityAt = (pt: maplibregl.PointLike): MapGeoJSONFeature | undefined => {
        const p = maplibregl.Point.convert(pt);
        const pad = 6;
        const layers = INTERACTIVE_CITY_LAYERS.filter((l: string) => map.getLayer(l) && map.getLayoutProperty(l, "visibility") !== "none");
        return map.queryRenderedFeatures([[p.x - pad, p.y - pad], [p.x + pad, p.y + pad]], { layers })[0];
      };

      map.on("mousemove", (e: MapMouseEvent) => {
        const city = cityAt(e.point);
        if (city) {
          setStateHover(null);
          map.getCanvas().style.cursor = "pointer";
          const pr = city.properties as { n: string; st: string; s?: number };
          setHover({
            x: e.point.x,
            y: e.point.y,
            title: `${pr.n}, ${pr.st}`,
            sub: pr.s === 2 ? "Visited" : pr.s === 1 ? "Want to visit" : undefined,
          });
          return;
        }
        const st = map.queryRenderedFeatures(e.point, { layers: ["states-fill"] })[0];
        if (st) {
          map.getCanvas().style.cursor = "pointer";
          setStateHover(st.id as number);
          setHover({ x: e.point.x, y: e.point.y, title: st.properties.name as string });
        } else {
          map.getCanvas().style.cursor = "";
          setStateHover(null);
          setHover(null);
        }
      });
      map.on("mouseout", () => {
        setStateHover(null);
        setHover(null);
      });
      map.on("movestart", () => setHover(null));

      map.on("click", (e: MapMouseEvent) => {
        const city = cityAt(e.point);
        if (city) {
          const pr = city.properties as { id: number; n: string; st: string; p: number; s?: number };
          const [lon, lat] = (city.geometry as GeoJSON.Point).coordinates;
          callbacks.current.onCityClick?.({ id: Number(pr.id), name: pr.n, state: pr.st, pop: Number(pr.p), s: (Number(pr.s ?? 0) as StatusCode), lon, lat });
          return;
        }
        const st = map.queryRenderedFeatures(e.point, { layers: ["states-fill"] })[0];
        if (st) callbacks.current.onStateClick?.(st.properties.code as string);
      });

      setLoaded(true);
      onReady?.();
    });

    return () => {
      map.remove();
      mapRef.current = null;
      setLoaded(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statesGeo, compact, usingBasemap]);

  /* ---------------- base cities ---------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map || !baseCities) return;
    const features = baseCities.ids.map((id, i) => ({
      type: "Feature" as const,
      id,
      geometry: { type: "Point" as const, coordinates: [baseCities.lon[i], baseCities.lat[i]] },
      properties: { id, n: baseCities.names[i], st: baseCities.states[i], p: baseCities.pop[i] },
    }));
    (map.getSource("cities") as GeoJSONSource).setData({ type: "FeatureCollection", features });
  }, [loaded, baseCities]);

  /* ---------------- my cities ---------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    const features = mine
      .filter((c) => c.s > 0 || c.custom)
      .map((c) => ({
        type: "Feature" as const,
        id: c.id,
        geometry: { type: "Point" as const, coordinates: [c.lon, c.lat] },
        properties: { id: c.id, n: c.name, st: c.state, p: c.pop, s: c.s },
      }));
    (map.getSource("mine") as GeoJSONSource).setData({ type: "FeatureCollection", features });
  }, [loaded, mine]);

  /* ---------------- state colours + filters ---------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    const byCode = new Map(stateStatus.map((s) => [s.code, s]));
    for (const [code, fips] of fipsByCode) {
      const s = byCode.get(code);
      let status = 0;
      if (s?.visited && filter.visited) status = 2;
      else if (s?.wanted && filter.want) status = 1;
      map.setFeatureState({ source: "states", id: fips }, { status });
    }
    const vis = (on: boolean) => (on ? "visible" : "none");
    for (const t of CITY_LAYERS_BASE) map.setLayoutProperty(t.id, "visibility", vis(filter.none));
    map.setLayoutProperty("mine-none", "visibility", vis(filter.none));
    map.setLayoutProperty("mine-want", "visibility", vis(filter.want));
    map.setLayoutProperty("mine-visited", "visibility", vis(filter.visited));
  }, [loaded, stateStatus, filter, fipsByCode]);

  /* ---------------- selected state outline ---------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    for (const fips of fipsByCode.values()) map.setFeatureState({ source: "states", id: fips }, { selected: false });
    if (selectedState) {
      const fips = fipsByCode.get(selectedState);
      if (fips !== undefined) map.setFeatureState({ source: "states", id: fips }, { selected: true });
    }
  }, [loaded, selectedState, fipsByCode]);

  /* ---------------- HTML labels (work without any glyph server) ---------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    type Label = { el: HTMLDivElement; marker: maplibregl.Marker; kind: "state" | "city"; priority: number; lngLat: [number, number] };
    const labels: Label[] = [];
    const make = (text: string, cls: string, lngLat: [number, number], kind: Label["kind"], priority: number, offsetY = 0) => {
      const el = document.createElement("div");
      el.className = cls;
      el.textContent = text;
      el.style.pointerEvents = "none";
      const marker = new maplibregl.Marker({ element: el, anchor: kind === "city" ? "left" : "center", offset: [kind === "city" ? 9 : 0, offsetY] })
        .setLngLat(lngLat)
        .addTo(map);
      labels.push({ el, marker, kind, priority, lngLat });
    };
    if (!usingBasemap) {
      for (const f of statesGeo.features) {
        const meta = STATE_BY_CODE.get(f.properties.code);
        make(f.properties.code, "tj-state-label", [f.properties.labelLon, f.properties.labelLat], "state", meta?.isState ? 1 : 0);
      }
    }
    const shown = mine.filter((c) => (c.s === 2 && filter.visited) || (c.s === 1 && filter.want));
    for (const c of shown) {
      make(c.name, c.s === 2 ? "tj-city-label tj-city-visited" : "tj-city-label tj-city-want", [c.lon, c.lat], "city", Math.log10(c.pop + 10) + c.s);
    }

    const layout = () => {
      const z = map.getZoom();
      const order = [...labels].sort((a, b) => {
        // your own cities always win; state abbreviations fill the remaining space
        const ka = a.kind === "state" ? -100 : 0;
        const kb = b.kind === "state" ? -100 : 0;
        return kb + b.priority - (ka + a.priority);
      });
      const placed: DOMRect[] = [];
      const { width, height } = map.getContainer().getBoundingClientRect();
      for (const l of order) {
        if (l.kind === "state" && z > 6.5) {
          l.el.style.visibility = "hidden";
          continue;
        }
        const p = map.project(l.lngLat);
        if (p.x < -50 || p.y < -20 || p.x > width + 50 || p.y > height + 20) {
          l.el.style.visibility = "hidden";
          continue;
        }
        const w = l.el.offsetWidth || l.el.textContent!.length * 7;
        const h = l.el.offsetHeight || 14;
        const x = l.kind === "city" ? p.x + 9 : p.x - w / 2;
        const r = new DOMRect(x - 2, p.y - h / 2 - 1, w + 4, h + 2);
        const hit = placed.some((q) => r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top);
        l.el.style.visibility = hit ? "hidden" : "visible";
        if (!hit) placed.push(r);
      }
    };
    layout();
    map.on("moveend", layout);
    map.on("zoomend", layout);
    return () => {
      map.off("moveend", layout);
      map.off("zoomend", layout);
      labels.forEach((l) => l.marker.remove());
    };
  }, [loaded, mine, statesGeo, filter, usingBasemap]);

  return (
    <div className={className ?? "relative"}>
      <div ref={container} style={{ position: "absolute", inset: 0 }} aria-label="Interactive map of the United States" role="region" />
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#eef2f1]" role="status">
          <span className="text-sm text-ink-soft">Drawing the map…</span>
        </div>
      )}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg bg-ink text-white text-xs px-2.5 py-1.5 shadow-[var(--shadow-lift)] whitespace-nowrap"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <span className="font-medium">{hover.title}</span>
          {hover.sub && <span className="opacity-75"> {hover.sub}</span>}
        </div>
      )}
    </div>
  );
});
