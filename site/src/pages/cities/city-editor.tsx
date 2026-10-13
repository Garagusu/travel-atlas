import { useRouter } from "@/lib/nav";
import { useState, useTransition } from "react";
import { clearCityLog, saveCityLog, setCityStatus } from "@/lib/actions";
import { StatusControl, type Status } from "@/components/status-control";
import { useConfirm } from "@/components/ui/dialog";
import { formatRange, todayIso } from "@/components/ui/format";
import { StarRating } from "@/components/ui/star-rating";
import { TagPicker } from "@/components/ui/tag-picker";
import { useToast } from "@/components/ui/toast";

export function CityStatusBar({
  cityId,
  cityName,
  status,
  visitedOn,
  visitedUntil,
  rating,
}: {
  cityId: number;
  cityName: string;
  status: Status;
  visitedOn: string | null;
  visitedUntil: string | null;
  rating: number | null;
}) {
  const [current, setCurrent] = useState(status);
  const [seenStatus, setSeenStatus] = useState(status);
  if (seenStatus !== status) {
    setSeenStatus(status);
    setCurrent(status);
  }
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <StatusControl
        value={current}
        disabled={pending}
        onChange={(s) => {
          const prev = current;
          setCurrent(s);
          start(async () => {
            const res = await setCityStatus(cityId, s);
            if (!res.ok) {
              setCurrent(prev);
              toast(res.error, "error");
            } else {
              toast(s === "visited" ? `${cityName} marked as visited` : s === "want_to_visit" ? `${cityName} is on your wishlist` : `${cityName} marked as not visited`);
              router.refresh();
            }
          });
        }}
      />
      {(visitedOn || visitedUntil) && <span className="text-sm text-ink-soft">{formatRange(visitedOn, visitedUntil)}</span>}
      <StarRating value={rating} readOnly size={16} />
    </div>
  );
}

type FormValues = {
  visitedOn: string;
  visitedUntil: string;
  rating: number | null;
  impression: string;
  notes: string;
  tags: string[];
};

export function CityJournalForm({ cityId, cityName, initial, hasRecord }: { cityId: number; cityName: string; initial: FormValues; hasRecord: boolean }) {
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [dirty, setDirty] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const set = <K extends keyof FormValues>(k: K, val: FormValues[K]) => {
    setV((x) => ({ ...x, [k]: val }));
    setDirty(true);
  };

  return (
    <form noValidate
      className="card p-5 sm:p-6 space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await saveCityLog(cityId, v);
          if (!res.ok) {
            setErrors(res.fieldErrors ?? { form: res.error });
            return;
          }
          setErrors({});
          setDirty(false);
          toast("Saved");
          router.refresh();
        });
      }}
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="visitedOn">First day there</label>
          <div className="flex gap-2">
            <input id="visitedOn" type="date" className="input" value={v.visitedOn} max={todayIso()} onChange={(e) => set("visitedOn", e.target.value)} aria-invalid={!!errors.visitedOn} />
          </div>
          {errors.visitedOn && <p className="field-error">{errors.visitedOn}</p>}
        </div>
        <div>
          <label className="label" htmlFor="visitedUntil">Last day there</label>
          <input id="visitedUntil" type="date" className="input" value={v.visitedUntil} min={v.visitedOn || undefined} onChange={(e) => set("visitedUntil", e.target.value)} aria-invalid={!!errors.visitedUntil} />
          {errors.visitedUntil && <p className="field-error">{errors.visitedUntil}</p>}
        </div>
      </div>
      <div>
        <span className="label">Your rating</span>
        <StarRating value={v.rating} onChange={(r) => set("rating", r)} />
      </div>
      <div>
        <label className="label" htmlFor="impression">Impression in a sentence</label>
        <input id="impression" className="input" maxLength={300} placeholder={`What ${cityName} felt like`} value={v.impression} onChange={(e) => set("impression", e.target.value)} />
        {errors.impression && <p className="field-error">{errors.impression}</p>}
      </div>
      <div>
        <span className="label">Tags</span>
        <TagPicker value={v.tags} onChange={(t) => set("tags", t)} />
        {errors.tags && <p className="field-error">{errors.tags}</p>}
      </div>
      <div>
        <label className="label" htmlFor="notes">Your notes</label>
        <textarea
          id="notes"
          className="input min-h-44 font-display text-[1.0625rem] leading-relaxed"
          placeholder="Where you stayed, who you were with, the moment you want to remember…"
          value={v.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
        {errors.notes && <p className="field-error">{errors.notes}</p>}
      </div>
      {errors.form && <p className="field-error" role="alert">{errors.form}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save notes"}</button>
        {dirty && <span className="text-sm text-ink-faint">Unsaved changes</span>}
        {hasRecord && (
          <button
            type="button"
            className="btn btn-ghost btn-sm ml-auto text-danger"
            disabled={pending}
            onClick={async () => {
              const ok = await confirm({
                title: `Clear ${cityName} from your journal?`,
                message: "This removes its status, dates, rating, tags, notes and saved places. Photos and journal entries are kept.",
                confirmLabel: "Clear record",
                danger: true,
              });
              if (!ok) return;
              start(async () => {
                const res = await clearCityLog(cityId);
                if (!res.ok) return toast(res.error, "error");
                toast(`${cityName} cleared`);
                setV({ visitedOn: "", visitedUntil: "", rating: null, impression: "", notes: "", tags: [] });
                setDirty(false);
                router.refresh();
              });
            }}
          >
            Clear record
          </button>
        )}
      </div>
    </form>
  );
}
