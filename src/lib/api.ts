import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser, type SessionUser } from "./auth";

export const jsonError = (status: number, error: string) => NextResponse.json({ error }, { status });

/** Route-handler auth: returns the user or a 401 response. */
export async function apiUser(): Promise<SessionUser | NextResponse> {
  const user = await getCurrentUser();
  return user ?? jsonError(401, "Sign in to continue");
}

/** Rejects cross-site state-changing requests (defence in depth on top of SameSite cookies). */
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
