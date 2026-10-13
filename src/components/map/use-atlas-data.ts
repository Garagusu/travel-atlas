"use client";

import { useCallback, useEffect, useState } from "react";
import type { BaseCities, MapStats, MyCity, StateStatus, StatesGeo, StatusCode } from "./types";

type StatusPayload = { cities: (MyCity & { status?: string })[]; states: StateStatus[]; stats: MapStats };

let statesPromise: Promise<StatesGeo> | null = null;
let basePromise: Promise<BaseCities> | null = null;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin" });
  if (res.status === 401) {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- session expired; leave the SPA entirely
    window.location.href = "/login";
    throw new Error("Signed out");
  }
  if (!res.ok) throw new Error(`${url} failed (${res.status})`);
  return res.json();
}

/** Loads map geometry (cached for the session) and the user's live statuses. */
export function useAtlasData({ withBaseCities = true }: { withBaseCities?: boolean } = {}) {
  const [statesGeo, setStatesGeo] = useState<StatesGeo | null>(null);
  const [baseCities, setBaseCities] = useState<BaseCities | null>(null);
  const [mine, setMine] = useState<MyCity[]>([]);
  const [stateStatus, setStateStatus] = useState<StateStatus[]>([]);
  const [stats, setStats] = useState<MapStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchJson<StatusPayload>("/api/map/status");
      setMine(data.cities.map((c) => ({ ...c, s: c.s as StatusCode })));
      setStateStatus(data.states);
      setStats(data.stats);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    statesPromise ??= fetchJson<StatesGeo>("/geo/states.json").catch((e) => {
      statesPromise = null;
      throw e;
    });
    statesPromise.then(setStatesGeo).catch((e) => setError(`Couldn't load state boundaries: ${e.message}`));
    if (withBaseCities) {
      basePromise ??= fetchJson<BaseCities>("/api/map/cities").catch((e) => {
        basePromise = null;
        throw e;
      });
      basePromise.then(setBaseCities).catch((e) => setError(`Couldn't load cities: ${e.message}`));
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching from the server is the external system here
    refresh();
  }, [refresh, withBaseCities]);

  /** Optimistically set a city's status before the server confirms. */
  const setLocalStatus = useCallback((city: Omit<MyCity, "s" | "custom"> & { custom?: boolean }, s: StatusCode) => {
    setMine((prev) => {
      const i = prev.findIndex((c) => c.id === city.id);
      const next = [...prev];
      if (i >= 0) next[i] = { ...next[i], s };
      else next.push({ ...city, custom: city.custom ?? false, s });
      return next;
    });
  }, []);

  return { statesGeo, baseCities, mine, stateStatus, stats, error, refresh, setLocalStatus };
}
