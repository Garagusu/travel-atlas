import { useEffect, useState } from "react";
import { BASE, getMapStatuses, getStateStatuses, getStats, useStore } from "@/lib/store";
import type { StatesGeo, StatusCode } from "./types";

let statesPromise: Promise<StatesGeo> | null = null;

/** Map geometry plus the user's live statuses from the browser store. */
export function useAtlasData({ withBaseCities = true }: { withBaseCities?: boolean } = {}) {
  const [statesGeo, setStatesGeo] = useState<StatesGeo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mine = useStore(() => getMapStatuses().map((c) => ({ ...c, pop: c.pop, s: c.s as StatusCode })));
  const stateStatus = useStore(getStateStatuses);
  const stats = useStore(getStats);

  useEffect(() => {
    statesPromise ??= fetch(new URL("data/states.json", document.baseURI)).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
    statesPromise.then(setStatesGeo).catch((e) => {
      statesPromise = null;
      setError(`Couldn't load state boundaries: ${e.message}`);
    });
  }, []);

  return {
    statesGeo,
    baseCities: withBaseCities ? BASE : null,
    mine,
    stateStatus,
    stats,
    error,
    refresh: async () => {},
    setLocalStatus: (..._args: unknown[]) => {},
  };
}
