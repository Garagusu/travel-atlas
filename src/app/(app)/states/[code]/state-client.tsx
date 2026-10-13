"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { addCustomCity, saveStateNotes, setCityStatus } from "@/app/actions/cities";
import { MiniMap } from "@/components/map/mini-map";
import type { Status } from "@/components/status-control";
import { useToast } from "@/components/ui/toast";

/** Compact status toggles for a list row. */
export function QuickStatus({ cityId, cityName, status }: { cityId: number; cityName: string; status: Status }) {
  const [current, setCurrent] = useState(status);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const change = (s: Status) => {
    const next = current === s ? "not_visited" : s;
    const prev = current;
    setCurrent(next);
    start(async () => {
      const res = await setCityStatus(cityId, next);
      if (!res.ok) {
        setCurrent(prev);
        return toast(res.error, "error");
      }
      router.refresh();
    });
  };
  return (
    <span className="flex gap-1 shrink-0" role="group" aria-label={`Status for ${cityName}`}>
      <button
        className={`h-7 px-2.5 rounded-full text-xs font-semibold border transition-colors ${current === "visited" ? "bg-pine border-pine text-white" : "border-line-strong text-ink-soft hover:border-pine hover:text-pine"}`}
        aria-pressed={current === "visited"}
        disabled={pending}
        onClick={() => change("visited")}
      >
        Visited
      </button>
      <button
        className={`h-7 px-2.5 rounded-full text-xs font-semibold border transition-colors ${current === "want_to_visit" ? "bg-marigold-bright border-marigold-bright text-ink" : "border-line-strong text-ink-soft hover:border-marigold hover:text-marigold"}`}
        aria-pressed={current === "want_to_visit"}
        disabled={pending}
        onClick={() => change("want_to_visit")}
      >
        Wishlist
      </button>
    </span>
  );
}

export function StateNotes({ code, initial }: { code: string; initial: string }) {
  const [notes, setNotes] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const dirty = notes !== initial;
  return (
    <form noValidate
      className="card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await saveStateNotes(code, { notes });
          if (!res.ok) return setError(res.error);
          setError(null);
          toast("Notes saved");
        });
      }}
    >
      <label className="sr-only" htmlFor="state-notes">State notes</label>
      <textarea
        id="state-notes"
        className="input min-h-40 font-display text-[1.0625rem] leading-relaxed"
        placeholder="Road trips, people you met, what surprised you about this state…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      {error && <p className="field-error">{error}</p>}
      <div className="mt-3 flex items-center gap-3">
        <button className="btn btn-primary btn-sm" disabled={pending || !dirty}>{pending ? "Saving…" : "Save notes"}</button>
        {dirty && <span className="text-sm text-ink-faint">Unsaved changes</span>}
      </div>
    </form>
  );
}

export function AddCityForm({ stateCode, bbox }: { stateCode: string; bbox: number[] }) {
  const [name, setName] = useState("");
  const [pt, setPt] = useState<{ lat: number; lon: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const center = useMemo(() => ({ lon: (bbox[0] + bbox[2]) / 2, lat: (bbox[1] + bbox[3]) / 2 }), [bbox]);
  const markers = useMemo(
    () => (pt ? [{ id: "new", lon: pt.lon, lat: pt.lat, label: name || "New town", kind: "city" as const }] : []),
    [pt, name],
  );
  return (
    <form noValidate
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!pt) return setError("Click the map to place the town");
        start(async () => {
          const res = await addCustomCity({ name, stateCode, lat: pt.lat, lon: pt.lon });
          if (!res.ok) return setError(res.error);
          router.push(`/cities/${res.data.id}`);
        });
      }}
    >
      <input className="input" placeholder="Town name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Town name" />
      <MiniMap
        markers={markers}
        height={200}
        zoom={stateCode === "AK" ? 3 : 5.2}
        highlightState={stateCode}
        onPick={(p) => setPt({ lat: Math.round(p.lat * 1e4) / 1e4, lon: Math.round(p.lon * 1e4) / 1e4 })}
        pickLabel={pt ? "Click to move the pin" : "Click to place the town"}
        center={center}
      />
      {error && <p className="field-error">{error}</p>}
      <button className="btn btn-secondary btn-sm" disabled={pending || !name.trim()}>{pending ? "Adding…" : "Add town"}</button>
    </form>
  );
}
