"use client";

import * as maplibregl from "maplibre-gl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ChevronUp, X } from "lucide-react";
import { setCityStatus } from "@/app/actions/cities";
import { SearchBox } from "@/components/search-box";
import { StatusControl, type Status } from "@/components/status-control";
import { TileGrid } from "@/components/tile-grid";
import { useToast } from "@/components/ui/toast";
import { REGION_VIEWS, STATE_BY_CODE, stateName } from "@/lib/geo/states-meta";
import { USMap, type USMapHandle } from "./us-map";
import { CODE_FROM_STATUS, STATUS_FROM_CODE, type CityPick, type MapStats, type StatusCode, type StatusFilter } from "./types";
import { useAtlasData } from "./use-atlas-data";

const FILTERS: { key: keyof StatusFilter; label: string; swatch: string }[] = [
  { key: "visited", label: "Visited", swatch: "bg-pine" },
  { key: "want", label: "Want to visit", swatch: "bg-marigold-bright" },
  { key: "none", label: "Not visited", swatch: "bg-[#9aa3a6]" },
];

export function MapExplorer({ userName }: { userName: string }) {
  const data = useAtlasData();
  const mapRef = useRef<USMapHandle>(null);
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [filter, setFilter] = useState<StatusFilter>({ visited: true, want: true, none: true });
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [city, setCity] = useState<CityPick | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [mapReady, setMapReady] = useState(false);

  /* city popup rendered with React into a MapLibre popup */
  const popupNode = useMemo(() => (typeof document !== "undefined" ? document.createElement("div") : null), []);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  const openCity = useCallback(
    (c: CityPick, fly = false) => {
      const map = mapRef.current?.map();
      if (!map || !popupNode) return;
      setCity(c);
      setSelectedState(c.state);
      popupRef.current?.remove();
      popupRef.current = new maplibregl.Popup({ closeButton: false, maxWidth: "300px", offset: 12, focusAfterOpen: false })
        .setLngLat([c.lon, c.lat])
        .setDOMContent(popupNode)
        .addTo(map);
      popupRef.current.on("close", () => setCity((cur) => (cur?.id === c.id ? null : cur)));
      if (fly) mapRef.current?.flyToCity(c, Math.max(map.getZoom(), 8));
    },
    [popupNode],
  );

  const selectState = useCallback((code: string) => {
    setSelectedState(code);
    setSheetOpen(true);
    popupRef.current?.remove();
    mapRef.current?.fitState(code);
  }, []);

  /* keep the open popup's status in sync with the user's records */
  const mineById = useMemo(() => new Map(data.mine.map((c) => [c.id, c])), [data.mine]);
  const cityStatus: StatusCode = city ? (mineById.get(city.id)?.s ?? 0) : 0;

  const changeStatus = (c: CityPick, next: Status) => {
    const prev = mineById.get(c.id)?.s ?? 0;
    data.setLocalStatus({ id: c.id, name: c.name, state: c.state, lon: c.lon, lat: c.lat, pop: c.pop }, CODE_FROM_STATUS[next]);
    startTransition(async () => {
      const res = await setCityStatus(c.id, next);
      if (!res.ok) {
        data.setLocalStatus({ id: c.id, name: c.name, state: c.state, lon: c.lon, lat: c.lat, pop: c.pop }, prev);
        toast(res.error, "error");
        return;
      }
      toast(next === "visited" ? `${c.name} marked as visited` : next === "want_to_visit" ? `${c.name} added to your wishlist` : `${c.name} marked as not visited`);
      await data.refresh();
    });
  };

  /* deep links: /?state=CA or /?city=123 */
  const handledParams = useRef(false);
  useEffect(() => {
    // Runs once the MapLibre map (an external system) is ready.
    if (!mapReady || handledParams.current) return;
    const st = params.get("state")?.toUpperCase();
    const cid = Number(params.get("city"));
    if (st && STATE_BY_CODE.has(st)) {
      handledParams.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to the map becoming ready
      selectState(st);
    } else if (cid) {
      const mine = mineById.get(cid);
      const b = data.baseCities;
      if (mine) {
        handledParams.current = true;
        openCity({ id: mine.id, name: mine.name, state: mine.state, pop: mine.pop, s: mine.s, lon: mine.lon, lat: mine.lat }, true);
      } else if (b) {
        handledParams.current = true;
        const i = b.ids.indexOf(cid);
        if (i >= 0) openCity({ id: cid, name: b.names[i], state: b.states[i], pop: b.pop[i], s: 0, lon: b.lon[i], lat: b.lat[i] }, true);
      }
    } else handledParams.current = true;
  }, [mapReady, params, mineById, data.baseCities, selectState, openCity]);

  const stats = data.stats;
  const selectedCities = useMemo(
    () => (selectedState ? data.mine.filter((c) => c.state === selectedState && c.s > 0).sort((a, b) => b.s - a.s || a.name.localeCompare(b.name)) : []),
    [data.mine, selectedState],
  );

  if (data.error && !data.statesGeo) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center">
        <div>
          <p className="font-display text-2xl mb-2">The map couldn&apos;t load</p>
          <p className="text-ink-soft mb-4">{data.error}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    );
  }

  const panel = (
    <PanelContent
      stats={stats}
      userName={userName}
      stateStatus={data.stateStatus}
      filter={filter}
      setFilter={setFilter}
      selectedState={selectedState}
      selectState={selectState}
      clearState={() => {
        setSelectedState(null);
        mapRef.current?.fitRegion("lower48");
      }}
      selectedCities={selectedCities}
      onCity={(c) => openCity({ id: c.id, name: c.name, state: c.state, pop: c.pop, s: c.s, lon: c.lon, lat: c.lat }, true)}
    />
  );

  return (
    <div className="flex-1 flex min-h-[calc(100dvh-3.5rem)] relative">
      <aside className="hidden lg:flex w-[370px] shrink-0 flex-col border-r border-line bg-paper overflow-y-auto max-h-[calc(100dvh-3.5rem)] sticky top-14">
        <div className="p-5 pb-0">
          <SearchBox
            onPickCity={(c) => openCity({ id: c.id, name: c.name, state: c.state, pop: c.population, s: CODE_FROM_STATUS[c.status as Status] ?? 0, lon: c.lon, lat: c.lat }, true)}
            onPickState={(s) => selectState(s.code)}
          />
        </div>
        {panel}
      </aside>

      <div className="flex-1 relative min-h-[60vh]">
        {data.statesGeo && (
          <USMap
            ref={mapRef}
            className="absolute inset-0"
            statesGeo={data.statesGeo}
            baseCities={data.baseCities}
            mine={data.mine}
            stateStatus={data.stateStatus}
            filter={filter}
            selectedState={selectedState}
            onCityClick={(c) => openCity(c)}
            onStateClick={selectState}
            onReady={() => setMapReady(true)}
          />
        )}

        {/* mobile search */}
        <div className="lg:hidden absolute top-3 left-3 right-3 z-20">
          <SearchBox
            inputClassName="shadow-[var(--shadow-soft)]"
            onPickCity={(c) => openCity({ id: c.id, name: c.name, state: c.state, pop: c.population, s: CODE_FROM_STATUS[c.status as Status] ?? 0, lon: c.lon, lat: c.lat }, true)}
            onPickState={(s) => selectState(s.code)}
          />
        </div>

        {/* region jumps */}
        <div className="absolute z-10 left-3 bottom-[5.5rem] lg:bottom-4 flex gap-1.5">
          {(Object.keys(REGION_VIEWS) as (keyof typeof REGION_VIEWS)[]).map((r) => (
            <button key={r} className="chip shadow-[var(--shadow-soft)]" onClick={() => mapRef.current?.fitRegion(r)}>
              {REGION_VIEWS[r].label}
            </button>
          ))}
        </div>

        {/* mobile bottom sheet */}
        <div className="lg:hidden absolute z-20 inset-x-0 bottom-0">
          <div className={`bg-paper border-t border-line rounded-t-2xl shadow-[0_-8px_24px_rgb(30_42_48/0.08)] ${sheetOpen ? "max-h-[70vh] overflow-y-auto" : ""}`}>
            <button className="w-full flex items-center justify-between px-5 py-3.5" onClick={() => setSheetOpen((o) => !o)} aria-expanded={sheetOpen}>
              <span className="text-left">
                <span className="font-display text-xl">{stats ? `${stats.statesVisited} of 50 states` : "Your progress"}</span>
                {stats && <span className="ml-2 text-sm text-ink-soft">{stats.citiesVisited} cities visited</span>}
              </span>
              <ChevronUp size={18} className={`transition-transform ${sheetOpen ? "" : "rotate-180"}`} aria-hidden />
            </button>
            {sheetOpen && <div className="pb-4">{panel}</div>}
          </div>
        </div>

        {data.error && data.statesGeo && (
          <div className="absolute top-16 lg:top-3 left-1/2 -translate-x-1/2 z-20 rounded-lg bg-danger text-white text-sm px-3 py-2" role="alert">
            {data.error}
          </div>
        )}
      </div>

      {popupNode &&
        city &&
        createPortal(
          <div className="w-[260px]">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display text-xl leading-tight">{city.name}</p>
                <p className="text-sm text-ink-soft">
                  {stateName(city.state)}
                  {city.pop > 0 && <>, pop. {city.pop.toLocaleString()}</>}
                </p>
              </div>
              <button className="text-ink-faint hover:text-ink -mr-1" aria-label="Close" onClick={() => popupRef.current?.remove()}>
                <X size={16} />
              </button>
            </div>
            <div className="mt-3">
              <StatusControl size="sm" value={STATUS_FROM_CODE[cityStatus]} disabled={pending} onChange={(s) => changeStatus(city, s)} />
            </div>
            <div className="mt-3 flex gap-2">
              <Link href={`/cities/${city.id}`} className="btn btn-primary btn-sm">Open city page</Link>
              <button className="btn btn-secondary btn-sm" onClick={() => router.push(`/states/${city.state}`)}>
                {city.state} state page
              </button>
            </div>
          </div>,
          popupNode,
        )}
    </div>
  );
}

function PanelContent({
  stats,
  userName,
  stateStatus,
  filter,
  setFilter,
  selectedState,
  selectState,
  clearState,
  selectedCities,
  onCity,
}: {
  stats: MapStats | null;
  userName: string;
  stateStatus: { code: string; visited: number; wanted: number }[];
  filter: StatusFilter;
  setFilter: (f: StatusFilter) => void;
  selectedState: string | null;
  selectState: (code: string) => void;
  clearState: () => void;
  selectedCities: { id: number; name: string; state: string; pop: number; s: StatusCode; lon: number; lat: number }[];
  onCity: (c: { id: number; name: string; state: string; pop: number; s: StatusCode; lon: number; lat: number }) => void;
}) {
  const sel = selectedState ? stateStatus.find((s) => s.code === selectedState) : null;
  return (
    <div className="p-5 space-y-6">
      <section aria-label="Progress">
        <p className="text-sm text-ink-soft">{userName.split(" ")[0]}&apos;s America</p>
        <p className="font-display text-[2.6rem] leading-none mt-1">
          {stats ? stats.statesVisited : "–"}
          <span className="text-ink-faint text-2xl"> of 50 states</span>
        </p>
        <div className="mt-3 h-2 rounded-full bg-fog overflow-hidden" role="progressbar" aria-valuenow={stats?.percentExplored ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label="Share of states visited">
          <div className="h-full bg-pine rounded-full transition-[width] duration-500" style={{ width: `${stats?.percentExplored ?? 0}%` }} />
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat label="explored" value={stats ? `${stats.percentExplored}%` : "–"} />
          <Stat label="cities visited" value={stats?.citiesVisited ?? "–"} />
          <Stat label="on wishlist" value={stats?.citiesWanted ?? "–"} />
        </dl>
      </section>

      <section aria-label="States">
        <TileGrid statuses={stateStatus} selected={selectedState} onSelect={selectState} />
      </section>

      <section aria-label="Filters">
        <p className="text-sm font-semibold mb-2">Show on map</p>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button key={f.key} className="chip toggle" aria-pressed={filter[f.key]} onClick={() => setFilter({ ...filter, [f.key]: !filter[f.key] })}>
              <span className={`h-2.5 w-2.5 rounded-full ${f.swatch} ring-1 ring-white`} aria-hidden />
              {f.label}
            </button>
          ))}
        </div>
      </section>

      {selectedState && (
        <section className="card p-4" aria-label={`${stateName(selectedState)} summary`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-display text-2xl leading-tight">{stateName(selectedState)}</p>
              <p className="text-sm text-ink-soft mt-0.5">
                {sel?.visited ? `${sel.visited} ${sel.visited === 1 ? "city" : "cities"} visited` : "Not visited yet"}
                {sel?.wanted ? `, ${sel.wanted} on your wishlist` : ""}
              </p>
            </div>
            <button className="text-ink-faint hover:text-ink" aria-label="Clear selection" onClick={clearState}>
              <X size={16} />
            </button>
          </div>
          {selectedCities.length > 0 && (
            <ul className="mt-3 space-y-1 max-h-48 overflow-y-auto">
              {selectedCities.map((c) => (
                <li key={c.id}>
                  <button className="w-full flex items-center gap-2 text-left text-sm py-1 hover:text-pine" onClick={() => onCity(c)}>
                    <span className={`h-2 w-2 rounded-full ${c.s === 2 ? "bg-pine" : "bg-marigold-bright"}`} aria-hidden />
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Link href={`/states/${selectedState}`} className="btn btn-primary btn-sm mt-4">
            Open state page
          </Link>
        </section>
      )}

      {!selectedState && stats && stats.citiesVisited === 0 && (
        <p className="text-sm text-ink-soft">
          Click any city dot on the map, or search above, and mark it as visited. Your states fill in as you go.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-card border border-line py-2.5">
      <dd className="font-display text-2xl leading-none">{value}</dd>
      <dt className="text-xs text-ink-soft mt-1">{label}</dt>
    </div>
  );
}
