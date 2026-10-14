"use client";

import { MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { locateOlderPhotos } from "@/app/actions/photos";

/** One-time helper: read the GPS position out of photos uploaded before locations were saved. */
export function LocateOlderPhotos({ count }: { count: number }) {
  const router = useRouter();
  const [state, setState] = useState<{ running: boolean; checked: number; found: number; total: number; error: string | null; done: boolean }>({
    running: false,
    checked: 0,
    found: 0,
    total: count,
    error: null,
    done: false,
  });

  const run = async () => {
    setState((s) => ({ ...s, running: true, error: null }));
    let checked = state.checked;
    let found = state.found;
    for (;;) {
      const res = await locateOlderPhotos();
      if (!res.ok) {
        setState((s) => ({ ...s, running: false, error: res.error }));
        return;
      }
      checked += res.data.checked;
      found += res.data.found;
      const total = checked + res.data.remaining;
      setState((s) => ({ ...s, checked, found, total }));
      if (res.data.remaining === 0 || res.data.checked === 0) break;
    }
    setState((s) => ({ ...s, running: false, done: true }));
    router.refresh();
  };

  if (count === 0 && !state.running && !state.done) return null;
  if (state.done) {
    return (
      <div className="card p-4 mb-6 text-sm" role="status">
        Done: {state.found} of {state.checked} older {state.checked === 1 ? "photo" : "photos"} had a location. Open a photo to see where it was taken.
      </div>
    );
  }
  return (
    <div className="card p-4 mb-6 flex flex-wrap items-center gap-3">
      <MapPin size={18} className="text-[#b4536a] shrink-0" aria-hidden />
      <p className="text-sm flex-1 min-w-[14rem]">
        {state.running ? (
          <span aria-live="polite">
            Reading locations… {state.checked} of {state.total} checked, {state.found} found
          </span>
        ) : (
          <>
            {state.total} {state.total === 1 ? "photo was" : "photos were"} uploaded before locations were saved. Their original files may still know where they were taken.
          </>
        )}
      </p>
      {state.error && <p className="field-error w-full">{state.error}</p>}
      <button className="btn btn-primary btn-sm" disabled={state.running} onClick={run}>
        {state.running ? "Working…" : state.checked ? "Continue" : "Find their locations"}
      </button>
    </div>
  );
}
