"use client";

import { Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { stateName } from "@/lib/geo/states-meta";

export type SearchCity = { id: number; name: string; state: string; lat: number; lon: number; population: number; status: string };
export type SearchState = { code: string; name: string; bbox: number[] };
type Result = { kind: "state"; item: SearchState } | { kind: "city"; item: SearchCity };

/**
 * Combobox that searches states and cities. `citiesOnly` hides states
 * (used when picking a city for a trip or journal entry).
 */
export function SearchBox({
  onPickCity,
  onPickState,
  citiesOnly,
  placeholder = "Search a state or city",
  autoFocus,
  className = "",
  inputClassName = "",
}: {
  onPickCity: (c: SearchCity) => void;
  onPickState?: (s: SearchState) => void;
  citiesOnly?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  inputClassName?: string;
}) {
  const [q, setQ] = useState("");
  const [rawResults, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listId = useId();
  const reqId = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}&limit=10`);
        if (!res.ok) throw new Error();
        const data: { states: SearchState[]; cities: SearchCity[] } = await res.json();
        if (id !== reqId.current) return;
        const r: Result[] = [
          ...(citiesOnly ? [] : data.states.map((s) => ({ kind: "state" as const, item: s }))),
          ...data.cities.map((c) => ({ kind: "city" as const, item: c })),
        ];
        setResults(r);
        setActive(0);
        setError(null);
      } catch {
        if (id === reqId.current) setError("Search isn't responding. Try again.");
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 160);
    return () => clearTimeout(t);
  }, [q, citiesOnly]);

  const pick = (r: Result) => {
    if (r.kind === "city") onPickCity(r.item);
    else onPickState?.(r.item);
    setQ("");
    setResults([]);
    setOpen(false);
  };

  const showList = open && q.trim().length >= 2;
  const results = q.trim().length >= 2 ? rawResults : [];

  return (
    <div className={`relative ${className}`}>
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" aria-hidden />
      <input
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
        className={`input pl-9 ${inputClassName}`}
        placeholder={placeholder}
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && results[active]) {
            e.preventDefault();
            pick(results[active]);
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      {showList && (
        <ul id={listId} role="listbox" className="absolute z-30 mt-1.5 w-full card py-1 max-h-80 overflow-y-auto">
          {loading && !results.length && <li className="px-3 py-2 text-sm text-ink-faint">Searching…</li>}
          {error && <li className="px-3 py-2 text-sm text-danger">{error}</li>}
          {!loading && !error && !results.length && <li className="px-3 py-2 text-sm text-ink-soft">No matching places</li>}
          {results.map((r, i) => (
            <li
              key={r.kind === "state" ? `s-${r.item.code}` : `c-${r.item.id}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(r);
              }}
              onMouseEnter={() => setActive(i)}
              className={`px-3 py-2 cursor-pointer flex items-baseline justify-between gap-3 ${i === active ? "bg-fog" : ""}`}
            >
              {r.kind === "state" ? (
                <>
                  <span className="font-medium">{r.item.name}</span>
                  <span className="text-xs text-ink-faint">State</span>
                </>
              ) : (
                <>
                  <span>
                    <span className="font-medium">{r.item.name}</span>
                    <span className="text-ink-soft">, {stateName(r.item.state)}</span>
                  </span>
                  <span className={`text-xs ${r.item.status === "visited" ? "text-pine font-semibold" : r.item.status === "want_to_visit" ? "text-marigold font-semibold" : "text-ink-faint"}`}>
                    {r.item.status === "visited" ? "Visited" : r.item.status === "want_to_visit" ? "Wishlist" : r.item.population ? `pop. ${r.item.population.toLocaleString()}` : ""}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
