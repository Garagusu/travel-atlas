import { useSearchParams } from "react-router";
import { CityCard } from "@/components/cards/city-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Container, PageHeader } from "@/components/ui/page-header";
import { TAGS } from "@/lib/constants";
import { Link, useTitle } from "@/lib/nav";
import { STATES } from "@/lib/states-meta";
import { listMyCities, useStore } from "@/lib/store";
import type { VisitStatus } from "@/lib/types";
import { CityFinder } from "./city-finder";

const TABS = [
  { key: "all", label: "All" },
  { key: "visited", label: "Visited" },
  { key: "want_to_visit", label: "Want to visit" },
  { key: "not_visited", label: "Not visited" },
] as const;

export function CitiesPage() {
  useTitle("Cities");
  const [sp, setSp] = useSearchParams();
  const status = (TABS.find((t) => t.key === sp.get("status"))?.key ?? "all") as VisitStatus | "all";
  const state = sp.get("state") ?? "";
  const tag = sp.get("tag") ?? "";
  const q = sp.get("q") ?? "";
  const everything = useStore(() => listMyCities());
  const list = everything
    .filter((c) => status === "all" || c.status === status)
    .filter((c) => !state || c.stateCode === state)
    .filter((c) => !tag || c.tags.includes(tag))
    .filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()));
  const counts = {
    all: everything.length,
    visited: everything.filter((c) => c.status === "visited").length,
    want_to_visit: everything.filter((c) => c.status === "want_to_visit").length,
    not_visited: everything.filter((c) => c.status === "not_visited").length,
  };
  const myStates = new Set(everything.map((c) => c.stateCode));
  const myTags = [...new Set(everything.flatMap((c) => c.tags))];
  const allTags = [...new Set([...TAGS.filter((t) => myTags.includes(t)), ...myTags])];
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    if (v && v !== "all") n.set(k, v);
    else n.delete(k);
    setSp(n, { replace: true });
  };
  const filtered = status !== "all" || state || tag || q;

  return (
    <Container>
      <PageHeader title="Cities" subtitle={`${counts.visited} visited, ${counts.want_to_visit} on your wishlist.`} actions={<CityFinder />} />
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => set("status", t.key)} className="chip" data-active={status === t.key}>
            {t.label} <span className="opacity-60">{counts[t.key]}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-8">
        <input value={q} onChange={(e) => set("q", e.target.value)} placeholder="Filter by name" className="input !w-48" aria-label="Filter by name" />
        <select value={state} onChange={(e) => set("state", e.target.value)} className="input !w-48" aria-label="State">
          <option value="">All states</option>
          {STATES.filter((s) => myStates.has(s.code))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((s) => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
        </select>
        <select value={tag} onChange={(e) => set("tag", e.target.value)} className="input !w-40" aria-label="Tag">
          <option value="">Any tag</option>
          {allTags.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        {filtered && <button className="btn btn-ghost" onClick={() => setSp(new URLSearchParams(), { replace: true })}>Reset</button>}
      </div>
      {everything.length === 0 ? (
        <EmptyState title="No cities yet" action={<Link href="/" className="btn btn-primary">Open the map</Link>}>
          Mark cities on the map, or use “Find a city” above. Every city you mark gets its own page for photos and notes.
        </EmptyState>
      ) : list.length === 0 ? (
        <EmptyState title="Nothing matches these filters" action={<button className="btn btn-secondary" onClick={() => setSp(new URLSearchParams())}>Reset filters</button>} />
      ) : (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {list.map((c) => (
            <li key={c.id}>
              <CityCard c={c} />
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
