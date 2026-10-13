import { Star } from "lucide-react";

const WORDS = ["", "Not for me", "It was fine", "Good", "Loved it", "A favorite"];

export function StarRating({ value, onChange, readOnly, size = 20 }: { value: number | null; onChange?: (v: number | null) => void; readOnly?: boolean; size?: number }) {
  if (readOnly) {
    if (!value) return null;
    return (
      <span className="inline-flex items-center gap-0.5" aria-label={`Rated ${value} out of 5: ${WORDS[value]}`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} size={size} className={i <= value ? "fill-marigold-bright text-marigold-bright" : "text-line-strong"} aria-hidden />
        ))}
      </span>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <div role="radiogroup" aria-label="Rating" className="inline-flex">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={value === i}
            aria-label={`${i} star${i > 1 ? "s" : ""}: ${WORDS[i]}`}
            className="p-0.5"
            onClick={() => onChange?.(value === i ? null : i)}
          >
            <Star size={size} className={value && i <= value ? "fill-marigold-bright text-marigold-bright" : "text-line-strong hover:text-marigold"} />
          </button>
        ))}
      </div>
      <span className="text-sm text-ink-soft">{value ? WORDS[value] : "No rating"}</span>
    </div>
  );
}
