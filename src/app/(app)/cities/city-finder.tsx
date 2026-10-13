"use client";

import { useRouter } from "next/navigation";
import { SearchBox } from "@/components/search-box";

export function CityFinder() {
  const router = useRouter();
  return (
    <SearchBox
      citiesOnly
      className="w-72"
      placeholder="Find a city"
      onPickCity={(c) => router.push(`/cities/${c.id}`)}
    />
  );
}
