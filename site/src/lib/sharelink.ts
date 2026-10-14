import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import { STATE_BY_CODE } from "./states-meta";
import { cityById, listAllPlaces } from "./store";

/* The Pages edition has no server, so a share link carries its list inside the
   URL (compressed). Nothing is stored anywhere; the link *is* the list. */

export type SharedPayload = {
  v: 1;
  t: string; // title
  c?: { n: string; s: string; la: number; lo: number }; // city
  p: { n: string; k: string; a?: string; no?: string; u?: string; la?: number; lo?: number; f?: 1; cn?: string; cs?: string }[];
};

const toB64Url = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64Url = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export const encodeShared = (p: SharedPayload) => toB64Url(deflateSync(strToU8(JSON.stringify(p)), { level: 9 }));
export function decodeShared(s: string): SharedPayload | null {
  try {
    const p = JSON.parse(strFromU8(inflateSync(fromB64Url(s))));
    return p?.v === 1 && Array.isArray(p.p) ? p : null;
  } catch {
    return null;
  }
}

/** Builds the payload for a city's places (or all places when cityId is null). */
export function buildShared(cityId: number | null, title: string): SharedPayload {
  const list = listAllPlaces().filter((p) => cityId === null || p.cityId === cityId);
  const c = cityId !== null ? cityById(cityId) : null;
  return {
    v: 1,
    t: title,
    c: c ? { n: c.name, s: c.state, la: c.lat, lo: c.lon } : undefined,
    p: list.map((p) => ({
      n: p.name,
      k: p.category,
      a: p.address ?? undefined,
      no: p.notes ?? undefined,
      u: p.url ?? undefined,
      la: p.lat ?? undefined,
      lo: p.lon ?? undefined,
      f: p.favorite ? 1 : undefined,
      cn: cityId === null ? p.cityName : undefined,
      cs: cityId === null ? p.stateCode : undefined,
    })),
  };
}

export const shareLinkFor = (p: SharedPayload) => `${location.origin}${location.pathname}#/s/${encodeShared(p)}`;
export const stateLabel = (code: string) => STATE_BY_CODE.get(code)?.name ?? code;
