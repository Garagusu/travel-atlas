import { useRouter } from "@/lib/nav";
import { useState, useTransition } from "react";
import { createTrip, updateTrip } from "@/lib/actions";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

type TripValues = { name: string; startDate: string; endDate: string; summary: string; notes: string };

export function TripFormDialog({
  open,
  onClose,
  trip,
}: {
  open: boolean;
  onClose: () => void;
  trip?: { id: string } & Partial<Record<keyof TripValues, string | null>>;
}) {
  const [v, setV] = useState<TripValues>({
    name: trip?.name ?? "",
    startDate: trip?.startDate ?? "",
    endDate: trip?.endDate ?? "",
    summary: trip?.summary ?? "",
    notes: trip?.notes ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const set = (k: keyof TripValues, val: string) => setV((x) => ({ ...x, [k]: val }));

  return (
    <Dialog open={open} onClose={onClose} title={trip ? "Edit trip" : "New trip"}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            if (trip) {
              const res = await updateTrip(trip.id, v);
              if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
              toast("Trip saved");
              onClose();
              router.refresh();
            } else {
              const res = await createTrip(v);
              if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
              toast(`${v.name} created`);
              router.push(`/trips/${res.data.id}`);
            }
          });
        }}
      >
        <div>
          <label className="label" htmlFor="trip-name">Trip name</label>
          <input id="trip-name" className="input" placeholder="New England Fall Road Trip" value={v.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} autoFocus />
          {errors.name && <p className="field-error">{errors.name}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="trip-start">Start date</label>
            <input id="trip-start" type="date" className="input" value={v.startDate} onChange={(e) => set("startDate", e.target.value)} aria-invalid={!!errors.startDate} />
            {errors.startDate && <p className="field-error">{errors.startDate}</p>}
          </div>
          <div>
            <label className="label" htmlFor="trip-end">End date</label>
            <input id="trip-end" type="date" className="input" value={v.endDate} min={v.startDate || undefined} onChange={(e) => set("endDate", e.target.value)} aria-invalid={!!errors.endDate} />
            {errors.endDate && <p className="field-error">{errors.endDate}</p>}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="trip-summary">One-line summary</label>
          <input id="trip-summary" className="input" placeholder="Leaf peeping from Boston to Acadia" value={v.summary} onChange={(e) => set("summary", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="trip-notes">Notes</label>
          <textarea id="trip-notes" className="input min-h-28" placeholder="Packing lists, bookings, what you'd do differently…" value={v.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>
        {errors.form && <p className="field-error" role="alert">{errors.form}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : trip ? "Save trip" : "Create trip"}</button>
        </div>
      </form>
    </Dialog>
  );
}

export function NewTripButton({ className = "btn btn-primary" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>New trip</button>
      {open && <TripFormDialog open={open} onClose={() => setOpen(false)} />}
    </>
  );
}
