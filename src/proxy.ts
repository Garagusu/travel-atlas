import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/signup"];

/**
 * Fast gate: anything without a session cookie goes to /login.
 * The session itself is verified against the database on every page,
 * server action and API route (see src/lib/auth.ts).
 */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (req.cookies.has("tj_session")) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Upload routes are excluded: Next buffers request bodies that pass through the
  // proxy (10 MB cap), and these routes authenticate every request themselves.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|geo/|maplibre/|manifest.webmanifest|icon|apple-icon|icon-192.png|icon-512.png|api/photos|api/import|s/).*)",
  ],
};
