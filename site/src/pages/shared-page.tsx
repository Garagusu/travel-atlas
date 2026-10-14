import { ExternalLink, Heart } from "lucide-react";
import { useMemo } from "react";
import { useParams } from "react-router";
import { MiniMap, type MiniMarker } from "@/components/map/mini-map";
import { PLACE_CATEGORY_LABEL } from "@/lib/constants";
import { useTitle } from "@/lib/nav";
import { CATEGORY_COLORS, mapsUrl, type PlaceCategoryKey } from "@/lib/places-util";
import { decodeShared, stateLabel } from "@/lib/sharelink";

type Cat = keyof typeof PLACE_CATEGORY_LABEL;

/** Read-only recommendations page opened from a shared link. */
export function SharedPage() {
  const data = useParams().data ?? "";
  const shared = useMemo(() => decodeShared(data), [data]);
  useTitle(shared?.t ?? "Shared list");
  const markers = useMemo<MiniMarker[]>(
    () =>
      (shared?.p ?? []).flatMap((p, i) => (p.la != null && p.lo != null ? [{ id: String(i), lat: p.la, lon: p.lo, label: p.n, kind: "place" as const }] : [])),
    [shared],
  );
  if (!shared) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 py-24 text-center">
        <div>
          <h1 className="text-3xl mb-2">This link can&apos;t be opened</h1>
          <p className="text-ink-soft">It may have been cut off when it was copied. Ask for the link again.</p>
        </div>
      </main>
    );
  }
  const groups = new Map<string, SharedPlace[]>();
  type SharedPlace = (typeof shared.p)[number];
  for (const p of shared.p) {
    const key = shared.c ? p.k : `${p.cn}|${p.cs}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return (
    <main className="flex-1">
      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <p className="text-sm text-ink-soft">A shared list of recommendations</p>
        <h1 className="text-4xl sm:text-5xl mt-1">{shared.c ? `${shared.c.n}, ${stateLabel(shared.c.s)}` : shared.t}</h1>
        {markers.length > 0 && (
          <div className="mt-8">
            <MiniMap markers={markers} height={320} zoom={13} />
          </div>
        )}
        <div className="mt-10 space-y-10">
          {[...groups.entries()].map(([key, list]) => {
            const [cn, cs] = key.split("|");
            const heading = shared.c ? PLACE_CATEGORY_LABEL[key as Cat] ?? "Places" : `${cn}, ${stateLabel(cs)}`;
            return (
              <section key={key} aria-label={heading}>
                <h2 className="text-2xl mb-3 flex items-center gap-2">
                  {shared.c && <span className="h-3 w-3 rounded-full" style={{ background: CATEGORY_COLORS[key as PlaceCategoryKey] }} aria-hidden />}
                  {heading}
                </h2>
                <ul className="grid sm:grid-cols-2 gap-3">
                  {list.map((p, i) => (
                    <li key={i} className="card p-4 flex flex-col">
                      {!shared.c && <p className="text-xs font-semibold" style={{ color: CATEGORY_COLORS[p.k as PlaceCategoryKey] }}>{PLACE_CATEGORY_LABEL[p.k as Cat]}</p>}
                      <p className="font-display text-xl leading-tight flex items-center gap-1.5">
                        {p.n}
                        {p.f && <Heart size={13} className="fill-danger text-danger" aria-label="A favorite" />}
                      </p>
                      {p.a && <p className="text-xs text-ink-faint mt-0.5">{p.a}</p>}
                      {p.no && <p className="text-sm text-ink-soft mt-2">{p.no}</p>}
                      <div className="mt-auto pt-3 flex flex-wrap gap-1.5">
                        <a
                          href={mapsUrl({ name: p.n, address: p.a, lat: p.la, lon: p.lo, cityName: p.cn ?? shared.c?.n, stateCode: p.cs ?? shared.c?.s })}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="btn btn-secondary btn-sm"
                        >
                          <ExternalLink size={13} /> Open in Maps
                        </a>
                        {p.u && <a href={p.u} target="_blank" rel="noreferrer noopener" className="btn btn-ghost btn-sm">Website</a>}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
        <p className="mt-16 text-xs text-ink-faint">Shared from a Travel Atlas journal. The list lives in this link; nothing is stored online.</p>
      </div>
    </main>
  );
}
