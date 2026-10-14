import { X } from "lucide-react";

type Filter = { year: number | null; cityId: number | null };

/** Year + city dropdowns for the photo library. Picking both shows e.g. only 2023 photos from Boston. */
export function PhotoFilterBar({
  filter,
  years,
  cities,
  cityLabel,
  total,
  onChange,
}: {
  filter: Filter;
  years: { year: number; count: number }[];
  cities: { cityId: number; label: string; count: number }[];
  /** name of the chosen city, shown in the result line */
  cityLabel: string | null;
  /** number of photos matching the current filter; null while unknown */
  total: number | null;
  onChange: (f: Filter) => void;
}) {
  // keep the current choice selectable even if the other dropdown narrowed it away
  const yearList = filter.year !== null && !years.some((y) => y.year === filter.year) ? [{ year: filter.year, count: 0 }, ...years] : years;
  const cityList =
    filter.cityId !== null && !cities.some((c) => c.cityId === filter.cityId)
      ? [{ cityId: filter.cityId, label: cityLabel ?? "Selected city", count: 0 }, ...cities]
      : cities;
  const active = filter.year !== null || filter.cityId !== null;
  const summary = [cityLabel && `from ${cityLabel}`, filter.year !== null && `in ${filter.year}`].filter(Boolean).join(" ");

  return (
    <div className="flex flex-wrap items-end gap-3 mb-4" role="search" aria-label="Filter photos">
      <div>
        <label className="label" htmlFor="pf-year">Year</label>
        <select
          id="pf-year"
          className="input !w-36"
          value={filter.year ?? ""}
          onChange={(e) => onChange({ ...filter, year: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">All years</option>
          {yearList.map((y) => (
            <option key={y.year} value={y.year}>
              {y.year} ({y.count})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="pf-city">City</label>
        <select
          id="pf-city"
          className="input !w-56"
          value={filter.cityId ?? ""}
          onChange={(e) => onChange({ ...filter, cityId: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">All cities</option>
          {cityList.map((c) => (
            <option key={c.cityId} value={c.cityId}>
              {c.label} ({c.count})
            </option>
          ))}
        </select>
      </div>
      {active && (
        <button className="btn btn-ghost btn-sm mb-1" onClick={() => onChange({ year: null, cityId: null })}>
          <X size={14} aria-hidden /> Clear filters
        </button>
      )}
      {active && total !== null && (
        <p className="text-sm text-ink-soft mb-2 w-full sm:w-auto" aria-live="polite">
          {total} {total === 1 ? "photo" : "photos"} {summary}
        </p>
      )}
    </div>
  );
}
