import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import { Link } from "@/lib/nav";
import { useRouter } from "@/lib/nav";
import { useMemo, useState, useTransition } from "react";
import { addTripStop, deleteTrip, removeTripStop, reorderTripStops, updateTripStop } from "@/lib/actions";
import { TripFormDialog } from "@/components/forms/trip-form";
import { MiniMap, type MiniMarker } from "@/components/map/mini-map";
import { SearchBox, type SearchCity } from "@/components/search-box";
import { StatusBadge, type Status } from "@/components/status-control";
import { useConfirm } from "@/components/ui/dialog";
import { formatRange } from "@/components/ui/format";
import { useToast } from "@/components/ui/toast";
import { stateName } from "@/lib/states-meta";

type Stop = {
  id: string;
  position: number;
  arriveOn: string | null;
  departOn: string | null;
  notes: string | null;
  cityId: number;
  cityName: string;
  stateCode: string;
  lat: number;
  lon: number;
  status: Status | null;
};

export function TripActions({ trip }: { trip: { id: string; name: string; startDate: string | null; endDate: string | null; summary: string | null; notes: string | null } }) {
  const [editing, setEditing] = useState(false);
  const confirm = useConfirm();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2">
      <button className="btn btn-secondary" onClick={() => setEditing(true)}>
        <Pencil size={14} /> Edit trip
      </button>
      <button
        className="btn btn-danger"
        disabled={pending}
        onClick={async () => {
          const ok = await confirm({
            title: `Delete ${trip.name}?`,
            message: "The trip and its route are deleted. Its photos and journal entries stay in your journal, unlinked from the trip.",
            confirmLabel: "Delete trip",
            danger: true,
          });
          if (ok) start(async () => { const r = await deleteTrip(trip.id); if (r.ok) router.push("/trips"); });
        }}
      >
        Delete
      </button>
      {editing && <TripFormDialog open onClose={() => setEditing(false)} trip={trip} />}
    </div>
  );
}

export function Itinerary({ tripId, stops: initial }: { tripId: string; stops: Stop[] }) {
  const [stops, setStops] = useState(initial);
  const [adding, setAdding] = useState<SearchCity | null>(null);
  const [form, setForm] = useState({ arriveOn: "", departOn: "", notes: "" });
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  // adopt fresh server data after refreshes
  const key = initial.map((s) => `${s.id}:${s.position}:${s.arriveOn}:${s.departOn}:${s.notes}:${s.status}`).join("|");
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setStops(initial);
  }

  const markers = useMemo<MiniMarker[]>(
    () => stops.map((s, i) => ({ id: s.id, lon: s.lon, lat: s.lat, label: s.cityName, kind: "stop", n: i + 1 })),
    [stops],
  );

  const move = (i: number, dir: -1 | 1) => {
    const next = [...stops];
    const [s] = next.splice(i, 1);
    next.splice(i + dir, 0, s);
    setStops(next);
    start(async () => {
      const res = await reorderTripStops(tripId, next.map((x) => x.id));
      if (!res.ok) {
        setStops(stops);
        toast(res.error, "error");
      } else router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      {stops.length > 0 && <MiniMap markers={markers} route height={340} zoom={9} />}

      {stops.length === 0 ? (
        <p className="text-ink-soft">No stops yet. Add the cities on this trip in the order you visited them.</p>
      ) : (
        <ol className="space-y-2">
          {stops.map((s, i) => (
            <li key={s.id} className="card p-3 sm:p-4">
              <div className="flex items-start gap-3">
                <span className="h-7 w-7 shrink-0 rounded-full bg-ink text-white text-xs font-semibold flex items-center justify-center mt-0.5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link href={`/cities/${s.cityId}`} className="font-display text-xl hover:text-pine">{s.cityName}</Link>
                    <span className="text-sm text-ink-soft">{stateName(s.stateCode)}</span>
                    {s.status && s.status !== "not_visited" && <StatusBadge status={s.status} />}
                  </div>
                  {(s.arriveOn || s.departOn) && <p className="text-sm text-ink-soft">{formatRange(s.arriveOn, s.departOn)}</p>}
                  {s.notes && editing !== s.id && <p className="text-sm mt-1">{s.notes}</p>}
                  {editing === s.id && (
                    <StopEditor
                      stop={s}
                      onCancel={() => setEditing(null)}
                      onSave={(v) =>
                        start(async () => {
                          const res = await updateTripStop(s.id, { cityId: s.cityId, ...v });
                          if (!res.ok) return toast(res.error, "error");
                          setEditing(null);
                          toast("Stop updated");
                          router.refresh();
                        })
                      }
                    />
                  )}
                </div>
                <div className="flex gap-0.5 shrink-0">
                  <button className="btn btn-ghost btn-icon !h-8 !w-8" disabled={i === 0 || pending} onClick={() => move(i, -1)} aria-label={`Move ${s.cityName} earlier`}>
                    <ArrowUp size={15} />
                  </button>
                  <button className="btn btn-ghost btn-icon !h-8 !w-8" disabled={i === stops.length - 1 || pending} onClick={() => move(i, 1)} aria-label={`Move ${s.cityName} later`}>
                    <ArrowDown size={15} />
                  </button>
                  <button className="btn btn-ghost btn-icon !h-8 !w-8" onClick={() => setEditing(s.id)} aria-label={`Edit ${s.cityName} stop`}>
                    <Pencil size={14} />
                  </button>
                  <button
                    className="btn btn-ghost btn-icon !h-8 !w-8"
                    aria-label={`Remove ${s.cityName} from route`}
                    onClick={async () => {
                      if (!(await confirm({ title: `Remove ${s.cityName}?`, message: "It's removed from this trip's route. The city, its photos and notes are kept.", confirmLabel: "Remove stop", danger: true }))) return;
                      start(async () => {
                        const res = await removeTripStop(s.id);
                        if (!res.ok) return toast(res.error, "error");
                        router.refresh();
                      });
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="card p-4">
        <p className="text-sm font-semibold mb-2">Add a stop</p>
        {!adding ? (
          <SearchBox citiesOnly placeholder="Search for a city" onPickCity={(c) => setAdding(c)} />
        ) : (
          <form noValidate
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const res = await addTripStop(tripId, { cityId: adding.id, ...form });
                if (!res.ok) return setError(res.error);
                toast(`${adding.name} added to the route`);
                setAdding(null);
                setForm({ arriveOn: "", departOn: "", notes: "" });
                setError(null);
                router.refresh();
              });
            }}
          >
            <p className="font-display text-lg">{adding.name}, {stateName(adding.state)}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="stop-arrive">Arrived</label>
                <input id="stop-arrive" type="date" className="input" value={form.arriveOn} onChange={(e) => setForm({ ...form, arriveOn: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="stop-depart">Left</label>
                <input id="stop-depart" type="date" className="input" value={form.departOn} min={form.arriveOn || undefined} onChange={(e) => setForm({ ...form, departOn: e.target.value })} />
              </div>
            </div>
            <input className="input" placeholder="Note for this stop (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} aria-label="Stop note" />
            {error && <p className="field-error">{error}</p>}
            <div className="flex gap-2">
              <button className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Adding…" : "Add to route"}</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(null)}>Cancel</button>
            </div>
          </form>
        )}
        <p className="text-xs text-ink-faint mt-2">A city can appear in many trips; its photos and notes stay on its own page.</p>
      </div>
    </div>
  );
}

function StopEditor({ stop, onSave, onCancel }: { stop: Stop; onSave: (v: { arriveOn: string; departOn: string; notes: string }) => void; onCancel: () => void }) {
  const [v, setV] = useState({ arriveOn: stop.arriveOn ?? "", departOn: stop.departOn ?? "", notes: stop.notes ?? "" });
  return (
    <form noValidate className="mt-2 space-y-2" onSubmit={(e) => { e.preventDefault(); onSave(v); }}>
      <div className="grid grid-cols-2 gap-2">
        <input type="date" className="input" value={v.arriveOn} onChange={(e) => setV({ ...v, arriveOn: e.target.value })} aria-label="Arrived" />
        <input type="date" className="input" value={v.departOn} onChange={(e) => setV({ ...v, departOn: e.target.value })} aria-label="Left" />
      </div>
      <input className="input" value={v.notes} placeholder="Note" onChange={(e) => setV({ ...v, notes: e.target.value })} aria-label="Stop note" />
      <div className="flex gap-2">
        <button className="btn btn-primary btn-sm">Save</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
