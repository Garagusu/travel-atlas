"use client";

import { Check, Star, Circle } from "lucide-react";

export type Status = "not_visited" | "want_to_visit" | "visited";

const OPTIONS: { value: Status; label: string; icon: typeof Check }[] = [
  { value: "visited", label: "Visited", icon: Check },
  { value: "want_to_visit", label: "Want to visit", icon: Star },
  { value: "not_visited", label: "Not visited", icon: Circle },
];

/** Three-way segmented control for a city's visit status. */
export function StatusControl({
  value,
  onChange,
  disabled,
  size = "md",
}: {
  value: Status;
  onChange: (s: Status) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label="Visit status" className="inline-flex rounded-full border border-line-strong bg-card p-0.5">
      {OPTIONS.map((o) => {
        const active = value === o.value;
        const Icon = o.icon;
        const activeCls =
          o.value === "visited" ? "bg-pine text-white" : o.value === "want_to_visit" ? "bg-marigold-bright text-ink" : "bg-ink text-white";
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => !active && onChange(o.value)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium transition-colors ${
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-2.5 text-xs sm:px-3.5 sm:text-sm"
            } ${active ? activeCls : "text-ink-soft hover:text-ink"} disabled:opacity-60`}
          >
            <Icon size={size === "sm" ? 12 : 14} strokeWidth={2.4} aria-hidden />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  if (status === "visited") return <span className="inline-flex items-center gap-1 rounded-full bg-pine-soft text-pine-deep text-xs font-semibold px-2 py-0.5"><Check size={11} strokeWidth={3} />Visited</span>;
  if (status === "want_to_visit") return <span className="inline-flex items-center gap-1 rounded-full bg-marigold-soft text-[#7a520c] text-xs font-semibold px-2 py-0.5"><Star size={11} strokeWidth={3} />Want to visit</span>;
  return <span className="inline-flex items-center rounded-full bg-fog text-ink-soft text-xs font-semibold px-2 py-0.5">Not visited</span>;
}
