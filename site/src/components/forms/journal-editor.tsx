import { X } from "lucide-react";
import { useRouter } from "@/lib/nav";
import { useState, useTransition } from "react";
import { createJournalEntry, updateJournalEntry } from "@/lib/actions";
import { PhotoThumb } from "@/components/photos/photo-gallery";
import { PhotoPicker } from "@/components/photos/photo-picker";
import { Uploader } from "@/components/photos/uploader";
import { SearchBox } from "@/components/search-box";
import { TagPicker } from "@/components/ui/tag-picker";
import { todayIso } from "@/components/ui/format";
import { useToast } from "@/components/ui/toast";
import type { PhotoItem } from "@/lib/types";
import { stateName } from "@/lib/states-meta";

export type JournalInitial = {
  id?: string;
  title: string;
  entryDate: string;
  city: { id: number; name: string; state: string } | null;
  tripId: string | null;
  body: string;
  highlights: string;
  placesVisited: string[];
  tags: string[];
  photos: PhotoItem[];
};

export function JournalEditor({ initial, trips }: { initial: JournalInitial; trips: { id: string; name: string }[] }) {
  const [v, setV] = useState({ ...initial, entryDate: initial.entryDate || todayIso() });
  const [placeInput, setPlaceInput] = useState("");
  const [picking, setPicking] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const addPlace = () => {
    const p = placeInput.trim();
    if (p && !v.placesVisited.includes(p)) setV({ ...v, placesVisited: [...v.placesVisited, p] });
    setPlaceInput("");
  };

  const submit = () =>
    start(async () => {
      const payload = {
        title: v.title,
        entryDate: v.entryDate,
        cityId: v.city?.id ?? null,
        tripId: v.tripId ?? "",
        body: v.body,
        highlights: v.highlights,
        placesVisited: v.placesVisited,
        tags: v.tags,
      };
      const photoIds = v.photos.map((p) => p.id);
      if (initial.id) {
        const res = await updateJournalEntry(initial.id, payload, photoIds);
        if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
        toast("Entry saved");
        router.push(`/journal/${initial.id}`);
      } else {
        const res = await createJournalEntry(payload, photoIds);
        if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
        toast("Entry saved");
        router.push(`/journal/${res.data.id}`);
      }
      router.refresh();
    });

  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div>
        <label className="sr-only" htmlFor="j-title">Title</label>
        <input
          id="j-title"
          className="w-full bg-transparent font-display text-4xl sm:text-5xl outline-none placeholder:text-line-strong border-b border-transparent focus:border-line-strong pb-2"
          placeholder="Title of this entry"
          value={v.title}
          onChange={(e) => setV({ ...v, title: e.target.value })}
          aria-invalid={!!errors.title}
          autoFocus={!initial.id}
        />
        {errors.title && <p className="field-error">{errors.title}</p>}
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div>
          <label className="label" htmlFor="j-date">Date</label>
          <input id="j-date" type="date" className="input" value={v.entryDate} onChange={(e) => setV({ ...v, entryDate: e.target.value })} aria-invalid={!!errors.entryDate} />
          {errors.entryDate && <p className="field-error">{errors.entryDate}</p>}
        </div>
        <div>
          <span className="label">City</span>
          {v.city ? (
            <div className="input flex items-center justify-between !py-[0.4rem]">
              <span className="truncate">{v.city.name}, {stateName(v.city.state)}</span>
              <button type="button" className="text-ink-faint hover:text-ink" aria-label="Clear city" onClick={() => setV({ ...v, city: null })}>
                <X size={15} />
              </button>
            </div>
          ) : (
            <SearchBox citiesOnly placeholder="Search a city" onPickCity={(c) => setV({ ...v, city: { id: c.id, name: c.name, state: c.state } })} />
          )}
        </div>
        <div>
          <label className="label" htmlFor="j-trip">Trip</label>
          <select id="j-trip" className="input" value={v.tripId ?? ""} onChange={(e) => setV({ ...v, tripId: e.target.value || null })}>
            <option value="">No trip</option>
            {trips.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="j-body">The story</label>
        <textarea
          id="j-body"
          className="input min-h-72 font-display text-[1.125rem] leading-[1.75]"
          placeholder="Write what happened. Blank lines start new paragraphs."
          value={v.body}
          onChange={(e) => setV({ ...v, body: e.target.value })}
        />
        {errors.body && <p className="field-error">{errors.body}</p>}
      </div>

      <div>
        <label className="label" htmlFor="j-high">Highlights and memories</label>
        <textarea id="j-high" className="input min-h-24" placeholder="The best meal, the view, the joke you'll keep retelling…" value={v.highlights} onChange={(e) => setV({ ...v, highlights: e.target.value })} />
      </div>

      <div>
        <label className="label" htmlFor="j-place">Places visited</label>
        <div className="flex gap-2">
          <input
            id="j-place"
            className="input"
            placeholder="Add a place and press Enter"
            value={placeInput}
            onChange={(e) => setPlaceInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addPlace();
              }
            }}
          />
          <button type="button" className="btn btn-secondary shrink-0" onClick={addPlace} disabled={!placeInput.trim()}>Add</button>
        </div>
        {v.placesVisited.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 mt-2">
            {v.placesVisited.map((p) => (
              <li key={p} className="chip !pr-1.5">
                {p}
                <button type="button" aria-label={`Remove ${p}`} onClick={() => setV({ ...v, placesVisited: v.placesVisited.filter((x) => x !== p) })}>
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <span className="label">Tags</span>
        <TagPicker value={v.tags} onChange={(tags) => setV({ ...v, tags })} />
      </div>

      <div>
        <div className="flex items-end justify-between mb-2">
          <span className="label !mb-0">Photos</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicking(true)}>Choose from library</button>
        </div>
        {v.photos.length > 0 && (
          <ul className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-3">
            {v.photos.map((p) => (
              <li key={p.id} className="relative">
                <PhotoThumb p={p} className="w-full aspect-square rounded-lg" />
                <button
                  type="button"
                  className="absolute top-1 right-1 h-6 w-6 rounded-full bg-card/95 flex items-center justify-center shadow"
                  aria-label="Remove photo from entry"
                  onClick={() => setV({ ...v, photos: v.photos.filter((x) => x.id !== p.id) })}
                >
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Uploader
          compact
          target={{ ...(v.city ? { cityId: v.city.id } : {}), ...(v.tripId ? { tripId: v.tripId } : {}) }}
          onUploaded={(p) => setV((cur) => ({ ...cur, photos: [...cur.photos, p] }))}
        />
        <p className="text-xs text-ink-faint mt-1.5">New uploads are also filed under the chosen city and trip.</p>
      </div>

      {errors.form && <p className="field-error" role="alert">{errors.form}</p>}
      <div className="flex gap-2 sticky bottom-0 bg-paper/95 backdrop-blur py-3 border-t border-line">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : initial.id ? "Save entry" : "Save entry"}</button>
        <button type="button" className="btn btn-ghost" onClick={() => router.back()}>Cancel</button>
      </div>

      <PhotoPicker
        open={picking}
        onClose={() => setPicking(false)}
        exclude={v.photos.map((p) => p.id)}
        title="Attach photos"
        confirmLabel="Attach"
        onDone={(_ids, chosen) => {
          setPicking(false);
          setV((cur) => ({ ...cur, photos: [...cur.photos, ...chosen] }));
        }}
      />
    </form>
  );
}
