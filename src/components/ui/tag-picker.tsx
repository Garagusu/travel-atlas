"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { TAGS } from "@/lib/constants";

/** Toggle preset tags or add your own. */
export function TagPicker({ value, onChange, suggestions = TAGS as readonly string[] }: { value: string[]; onChange: (t: string[]) => void; suggestions?: readonly string[] }) {
  const [custom, setCustom] = useState("");
  const all = [...new Set([...suggestions, ...value])];
  const toggle = (t: string) => onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t]);
  const add = () => {
    const t = custom.trim().replace(/\s+/g, " ").slice(0, 40);
    if (t && !value.includes(t)) onChange([...value, t]);
    setCustom("");
  };
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {all.map((t) => (
        <button key={t} type="button" className="chip" aria-pressed={value.includes(t)} onClick={() => toggle(t)}>
          {t}
        </button>
      ))}
      <span className="inline-flex items-center">
        <input
          className="input !h-7 !py-0 !px-2.5 !text-[13px] !rounded-full w-32"
          placeholder="Add a tag"
          value={custom}
          aria-label="Add a custom tag"
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        {custom.trim() && (
          <button type="button" className="ml-1 btn btn-ghost btn-icon !h-7 !w-7" onClick={add} aria-label="Add tag">
            <Plus size={14} />
          </button>
        )}
      </span>
    </div>
  );
}
