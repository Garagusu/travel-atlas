import Link from "next/link";
import { CityCard } from "@/components/cards/city-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Container, PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { TAGS } from "@/lib/constants";
import { listMyCities } from "@/lib/data";
import { STATES } from "@/lib/geo/states-meta";
import { CityFinder } from "./city-finder";

export const metadata = { title: "Cities" };

const TABS = [
  { key: "all", label: "All" },
  { key: "visited", label: "Visited" },
  { key: "want_to_visit", label: "Want to visit" },
  { key: "not_visited", label: "Not visited" },
] as const;

export default async function CitiesPage({ searchParams }: PageProps<"/cities">) {
  const user = await requireUser();
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const status = (TABS.find((t) => t.key === str(sp.status))?.key ?? "all") as (typeof TABS)[number]["key"];
  const state = str(sp.state);
  const tag = str(sp.tag);
  const q = str(sp.q)?.slice(0, 80);
  const [list, everything] = await Promise.all([
    listMyCities(user.id, { status, state, tag, q }),
    listMyCities(user.id),
  ]);
  const counts = {
    all: everything.length,
    visited: everything.filter((c) => c.status === "visited").length,
    want_to_visit: everything.filter((c) => c.status === "want_to_visit").length,
    not_visited: everything.filter((c) => c.status === "not_visited").length,
  };
  const myStates = [...new Set(everything.map((c) => c.stateCode))];
  const myTags = [...new Set([...everything.flatMap((c) => c.tags)])];
  const allTags = [...new Set([...TAGS.filter((t) => myTags.includes(t)), ...myTags])];
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { status: status === "all" ? undefined : status, state, tag, q, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `/cities${s ? `?${s}` : ""}`;
  };
  const filtered = status !== "all" || state || tag || q;

  return (
    <Container>
      <PageHeader
        title="Cities"
        subtitle={`${counts.visited} visited, ${counts.want_to_visit} on your wishlist.`}
        actions={<CityFinder />}
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {TABS.map((t) => (
          <Link key={t.key} href={href({ status: t.key === "all" ? undefined : t.key })} className="chip" data-active={status === t.key}>
            {t.label} <span className="opacity-60">{counts[t.key]}</span>
          </Link>
        ))}
      </div>

      <form noValidate className="flex flex-wrap gap-2 mb-8" action="/cities">
        {status !== "all" && <input type="hidden" name="status" value={status} />}
        <input name="q" defaultValue={q} placeholder="Filter by name" className="input !w-48" aria-label="Filter by name" />
        <select name="state" defaultValue={state ?? ""} className="input !w-48" aria-label="State">
          <option value="">All states</option>
          {STATES.filter((s) => myStates.includes(s.code)).sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
            <option key={s.code} value={s.code}>{s.name}</option>
          ))}
        </select>
        <select name="tag" defaultValue={tag ?? ""} className="input !w-40" aria-label="Tag">
          <option value="">Any tag</option>
          {allTags.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button className="btn btn-secondary">Apply</button>
        {filtered && <Link href="/cities" className="btn btn-ghost">Reset</Link>}
      </form>

      {everything.length === 0 ? (
        <EmptyState title="No cities yet" action={<Link href="/" className="btn btn-primary">Open the map</Link>}>
          Mark cities on the map, or use “Find a city” above. Every city you mark gets its own page for photos and notes.
        </EmptyState>
      ) : list.length === 0 ? (
        <EmptyState title="Nothing matches these filters" action={<Link href="/cities" className="btn btn-secondary">Reset filters</Link>} />
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
