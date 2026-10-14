import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

export type StatusCode = 0 | 1 | 2; // not visited, want to visit, visited

export type StatesGeo = FeatureCollection<
  Polygon | MultiPolygon,
  { fips: string; code: string; name: string; labelLon: number; labelLat: number }
>;

export type BaseCities = {
  ids: number[];
  names: string[];
  states: string[];
  lon: number[];
  lat: number[];
  pop: number[];
};

export type MyCity = {
  id: number;
  name: string;
  state: string;
  lon: number;
  lat: number;
  pop: number;
  s: StatusCode;
  custom: boolean;
};

export type StateStatus = { code: string; visited: number; wanted: number };

export type MapStats = {
  statesVisited: number;
  statesWanted: number;
  citiesVisited: number;
  citiesWanted: number;
  trips: number;
  photos: number;
  journalEntries: number;
  percentExplored: number;
  totalStates: number;
};

export type CityPick = {
  id: number;
  name: string;
  state: string;
  pop: number;
  s: StatusCode;
  lon: number;
  lat: number;
};

export type StatusFilter = { visited: boolean; want: boolean; none: boolean; places?: boolean };

export type MapPlace = {
  id: string;
  name: string;
  category: string;
  address: string | null;
  notes: string | null;
  favorite: boolean;
  cityId: number;
  cityName: string;
  stateCode: string;
  lat: number;
  lon: number;
  pinned: boolean;
};

export const STATUS_FROM_CODE = ["not_visited", "want_to_visit", "visited"] as const;
export const CODE_FROM_STATUS = { not_visited: 0, want_to_visit: 1, visited: 2 } as const;
