import { MapPin } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { searchOsm, searchPhoton, type FoundPlace } from "@/lib/places-util";

/**
 * The place name field, with suggestions as you type (like a maps app).
 * Picking a suggestion fills name, address, location and kind; ignoring them
 * keeps whatever you typed as the name.
 */
export function PlaceNameInput({
  id,
  value,
  onChange,
  onPick,
  near,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onPick: (p: FoundPlace) => void;
  near: { lat: number; lon: number; name: string };
  invalid?: boolean;
}) {
  const [results, setResults] = useState<FoundPlace[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const typed = useRef(false);
  const listId = useId();

  useEffect(() => {
    const q = value.trim();
    if (!typed.current || q.length < 3) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setStatus("loading");
      try {
        const r = await searchPhoton(q, near, ctrl.signal);
        setResults(r);
        setActive(0);
        setOpen(true);
        setStatus("idle");
      } catch (e) {
        if ((e as Error).name !== "AbortError") setStatus("error");
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value, near]);

  const pick = (p: FoundPlace) => {
    typed.current = false;
    onPick(p);
    setOpen(false);
    setResults([]);
  };

  // If suggestions are down, Enter runs a one-off search on the other OpenStreetMap service.
  const fallbackSearch = async () => {
    setStatus("loading");
    try {
      const r = await searchOsm(`${value} ${near.name}`, near);
      setResults(r);
      setOpen(true);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  };

  const show = open && value.trim().length >= 3;
  return (
    <div className="relative">
      <input
        id={id}
        className="input pr-9"
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid}
        autoComplete="off"
        placeholder="Start typing a name or address"
        value={value}
        onChange={(e) => {
          typed.current = true;
          onChange(e.target.value);
        }}
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (show && results[active]) pick(results[active]);
            else if (status === "error") void fallbackSearch();
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      {status === "loading" && <span className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-line-strong border-t-pine animate-spin" aria-hidden />}
      {status === "error" && <p className="text-xs text-ink-soft mt-1">Suggestions aren&apos;t loading. Press Enter to search, or paste a map link below.</p>}
      {show && (
        <ul id={listId} role="listbox" aria-label="Suggestions" className="absolute z-30 mt-1 w-full card py-1 max-h-72 overflow-y-auto">
          {results.length === 0 && status !== "loading" && <li className="px-3 py-2 text-sm text-ink-soft">No suggestions. Keep typing, or save it with this name.</li>}
          {results.map((r, i) => (
            <li
              key={`${r.lat},${r.lon},${i}`}
              role="option"
              aria-selected={i === active}
              className={`px-3 py-2 cursor-pointer flex gap-2 ${i === active ? "bg-fog" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(r);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <MapPin size={14} className="text-ink-faint mt-1 shrink-0" aria-hidden />
              <span className="min-w-0">
                <span className="font-medium">{r.name}</span> <span className="text-xs text-ink-faint">{r.kind}</span>
                {r.address && <span className="block text-xs text-ink-soft truncate">{r.address}</span>}
              </span>
            </li>
          ))}
          <li className="px-3 pt-1 pb-0.5 text-[10px] text-ink-faint" aria-hidden>Suggestions from OpenStreetMap</li>
        </ul>
      )}
    </div>
  );
}
