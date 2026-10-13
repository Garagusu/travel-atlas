import { Link, useTitle } from "@/lib/nav";
import { CityCard } from "@/components/cards/city-card";
import { TileGrid } from "@/components/tile-grid";
import { EmptyState } from "@/components/ui/empty-state";
import { Container, PageHeader } from "@/components/ui/page-header";
import { getStateStatuses, useStore, wishlist } from "@/lib/store";
import { STATES } from "@/lib/states-meta";
import { CityFinder } from "./cities/city-finder";

export function WishlistPage() {
  useTitle("Wishlist");
  const items = useStore(() => wishlist());
  const statuses = useStore(getStateStatuses);
  const byState = new Map<string, typeof items>();
  for (const c of items) byState.set(c.stateName, [...(byState.get(c.stateName) ?? []), c]);
  const visitedStates = new Set(statuses.filter((s) => s.visited).map((s) => s.code));
  const unvisited = STATES.filter((s) => s.isState && !visitedStates.has(s.code));

  return (
    <Container>
      <PageHeader
        title="Wishlist"
        subtitle={items.length ? `${items.length} ${items.length === 1 ? "place" : "places"} you want to see.` : "Places you want to see next."}
        actions={<CityFinder />}
      />
      {items.length === 0 ? (
        <EmptyState title="Your wishlist is empty" action={<Link href="/" className="btn btn-primary">Browse the map</Link>}>
          Mark a city as “Want to visit” from the map or a city page and it shows up here, along with any places you saved there.
        </EmptyState>
      ) : (
        <div className="space-y-10">
          {[...byState.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([state, list]) => (
              <section key={state} aria-label={state}>
                <h2 className="text-2xl mb-4">
                  <Link href={`/states/${list[0].stateCode}`} className="hover:text-pine">{state}</Link>
                </h2>
                <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {list.map((c) => (
                    <li key={c.id}>
                      <CityCard c={{ ...c, status: "want_to_visit" }} />
                      {c.placeCount > 0 && (
                        <p className="text-xs text-ink-soft mt-1.5 px-1">
                          {c.placeCount} saved {c.placeCount === 1 ? "place" : "places"} to try
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}

      <section className="mt-14 grid md:grid-cols-[1fr_1.2fr] gap-8 items-start" aria-labelledby="unvisited-h">
        <div>
          <h2 id="unvisited-h" className="text-2xl mb-2">States you haven&apos;t visited</h2>
          <p className="text-ink-soft text-sm mb-4">{unvisited.length} of 50 to go. Open one to pick cities for your wishlist.</p>
          <div className="flex flex-wrap gap-1.5">
            {unvisited.map((s) => (
              <Link key={s.code} href={`/states/${s.code}`} className="chip hover:border-ink-faint">
                {s.name}
              </Link>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <TileGrid statuses={statuses} hrefPrefix="/states/" />
          <p className="mt-3 flex gap-4 text-xs text-ink-soft">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-pine" />Visited</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-marigold-bright" />Wishlist</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-fog border border-line" />Not yet</span>
          </p>
        </div>
      </section>
    </Container>
  );
}
