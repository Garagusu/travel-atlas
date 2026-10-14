import type { PhotoItem } from "./types";

/** Year a photo belongs to: the day it was taken, or the upload day when the camera date is missing. */
export function photoYear(p: Pick<PhotoItem, "takenOn" | "createdAt">): number {
  const s = p.takenOn ?? p.createdAt;
  return Number(s.slice(0, 4));
}

export type PhotoFilter = { year: number | null; cityId: number | null };
export type YearOption = { year: number; count: number };
export type CityOption = { cityId: number; label: string; count: number };

export function applyPhotoFilter<T extends PhotoItem>(photos: T[], f: PhotoFilter): T[] {
  return photos.filter((p) => (f.year === null || photoYear(p) === f.year) && (f.cityId === null || p.cityId === f.cityId));
}

/**
 * Options for the two dropdowns. Each list is narrowed by the other choice,
 * so picking 2023 only offers cities with 2023 photos (and vice versa).
 */
export function photoFilterOptions(photos: PhotoItem[], f: PhotoFilter): { years: YearOption[]; cities: CityOption[] } {
  const years = new Map<number, number>();
  const cities = new Map<number, CityOption>();
  for (const p of photos) {
    const y = photoYear(p);
    if (f.cityId === null || p.cityId === f.cityId) years.set(y, (years.get(y) ?? 0) + 1);
    if (p.cityId !== null && (f.year === null || y === f.year)) {
      const c = cities.get(p.cityId);
      if (c) c.count++;
      else cities.set(p.cityId, { cityId: p.cityId, label: p.stateCode ? `${p.cityName}, ${p.stateCode}` : p.cityName ?? "Unknown city", count: 1 });
    }
  }
  return {
    years: [...years].map(([year, count]) => ({ year, count })).sort((a, b) => b.year - a.year),
    cities: [...cities.values()].sort((a, b) => a.label.localeCompare(b.label)),
  };
}
