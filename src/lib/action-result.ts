import type { FieldErrors } from "./validation";

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string; fieldErrors?: FieldErrors };

export const ok = <T,>(data?: T) => ({ ok: true as const, data: data as T });
export const fail = (error: string, fieldErrors?: FieldErrors) => ({ ok: false as const, error, fieldErrors });
