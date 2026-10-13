/**
 * Static facts about the 50 states + DC.
 * FIPS codes match the US Census Bureau boundaries shipped in `us-atlas`.
 * `tile` is the [column, row] in the 50-state tile-grid used for progress views.
 */
export type StateMeta = {
  code: string;
  name: string;
  fips: string;
  isState: boolean;
  tile: [number, number];
};

export const STATES: StateMeta[] = [
  { code: "AK", name: "Alaska", fips: "02", isState: true, tile: [0, 0] },
  { code: "ME", name: "Maine", fips: "23", isState: true, tile: [11, 0] },
  { code: "VT", name: "Vermont", fips: "50", isState: true, tile: [9, 1] },
  { code: "NH", name: "New Hampshire", fips: "33", isState: true, tile: [10, 1] },
  { code: "WA", name: "Washington", fips: "53", isState: true, tile: [1, 2] },
  { code: "ID", name: "Idaho", fips: "16", isState: true, tile: [2, 2] },
  { code: "MT", name: "Montana", fips: "30", isState: true, tile: [3, 2] },
  { code: "ND", name: "North Dakota", fips: "38", isState: true, tile: [4, 2] },
  { code: "MN", name: "Minnesota", fips: "27", isState: true, tile: [5, 2] },
  { code: "WI", name: "Wisconsin", fips: "55", isState: true, tile: [6, 2] },
  { code: "MI", name: "Michigan", fips: "26", isState: true, tile: [8, 2] },
  { code: "NY", name: "New York", fips: "36", isState: true, tile: [9, 2] },
  { code: "MA", name: "Massachusetts", fips: "25", isState: true, tile: [10, 2] },
  { code: "OR", name: "Oregon", fips: "41", isState: true, tile: [1, 3] },
  { code: "NV", name: "Nevada", fips: "32", isState: true, tile: [2, 3] },
  { code: "WY", name: "Wyoming", fips: "56", isState: true, tile: [3, 3] },
  { code: "SD", name: "South Dakota", fips: "46", isState: true, tile: [4, 3] },
  { code: "IA", name: "Iowa", fips: "19", isState: true, tile: [5, 3] },
  { code: "IL", name: "Illinois", fips: "17", isState: true, tile: [6, 3] },
  { code: "IN", name: "Indiana", fips: "18", isState: true, tile: [7, 3] },
  { code: "OH", name: "Ohio", fips: "39", isState: true, tile: [8, 3] },
  { code: "PA", name: "Pennsylvania", fips: "42", isState: true, tile: [9, 3] },
  { code: "NJ", name: "New Jersey", fips: "34", isState: true, tile: [10, 3] },
  { code: "CT", name: "Connecticut", fips: "09", isState: true, tile: [11, 3] },
  { code: "RI", name: "Rhode Island", fips: "44", isState: true, tile: [12, 3] },
  { code: "CA", name: "California", fips: "06", isState: true, tile: [1, 4] },
  { code: "UT", name: "Utah", fips: "49", isState: true, tile: [2, 4] },
  { code: "CO", name: "Colorado", fips: "08", isState: true, tile: [3, 4] },
  { code: "NE", name: "Nebraska", fips: "31", isState: true, tile: [4, 4] },
  { code: "MO", name: "Missouri", fips: "29", isState: true, tile: [5, 4] },
  { code: "KY", name: "Kentucky", fips: "21", isState: true, tile: [6, 4] },
  { code: "WV", name: "West Virginia", fips: "54", isState: true, tile: [7, 4] },
  { code: "VA", name: "Virginia", fips: "51", isState: true, tile: [8, 4] },
  { code: "MD", name: "Maryland", fips: "24", isState: true, tile: [9, 4] },
  { code: "DE", name: "Delaware", fips: "10", isState: true, tile: [10, 4] },
  { code: "DC", name: "District of Columbia", fips: "11", isState: false, tile: [11, 4] },
  { code: "AZ", name: "Arizona", fips: "04", isState: true, tile: [2, 5] },
  { code: "NM", name: "New Mexico", fips: "35", isState: true, tile: [3, 5] },
  { code: "KS", name: "Kansas", fips: "20", isState: true, tile: [4, 5] },
  { code: "AR", name: "Arkansas", fips: "05", isState: true, tile: [5, 5] },
  { code: "TN", name: "Tennessee", fips: "47", isState: true, tile: [6, 5] },
  { code: "NC", name: "North Carolina", fips: "37", isState: true, tile: [7, 5] },
  { code: "SC", name: "South Carolina", fips: "45", isState: true, tile: [8, 5] },
  { code: "OK", name: "Oklahoma", fips: "40", isState: true, tile: [4, 6] },
  { code: "LA", name: "Louisiana", fips: "22", isState: true, tile: [5, 6] },
  { code: "MS", name: "Mississippi", fips: "28", isState: true, tile: [6, 6] },
  { code: "AL", name: "Alabama", fips: "01", isState: true, tile: [7, 6] },
  { code: "GA", name: "Georgia", fips: "13", isState: true, tile: [8, 6] },
  { code: "HI", name: "Hawaii", fips: "15", isState: true, tile: [0, 7] },
  { code: "TX", name: "Texas", fips: "48", isState: true, tile: [4, 7] },
  { code: "FL", name: "Florida", fips: "12", isState: true, tile: [9, 7] },
];

export const TOTAL_STATES = 50;

export const STATE_BY_CODE = new Map(STATES.map((s) => [s.code, s]));
export const STATE_BY_FIPS = new Map(STATES.map((s) => [s.fips, s]));

export function stateName(code: string) {
  return STATE_BY_CODE.get(code.toUpperCase())?.name ?? code;
}

export function isValidStateCode(code: string) {
  return STATE_BY_CODE.has(code.toUpperCase());
}

/** Map views that don't play well with a single fitBounds of the whole country. */
export const REGION_VIEWS = {
  lower48: { label: "Lower 48", bounds: [-125.5, 24.0, -66.5, 49.6] as [number, number, number, number] },
  alaska: { label: "Alaska", bounds: [-170, 51, -129.5, 71.6] as [number, number, number, number] },
  hawaii: { label: "Hawaii", bounds: [-160.5, 18.8, -154.6, 22.4] as [number, number, number, number] },
};
