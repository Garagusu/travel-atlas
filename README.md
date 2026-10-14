# Travel Atlas

A private travel journal for the United States. Open it and the first thing you see is an interactive map of all 50 states, coloured by where you've been. Every city has its own page for photos, notes, ratings, tags and favourite places; trips tie cities together into routes; the journal keeps the stories.

- **Map**: MapLibre GL with real US Census state boundaries and ~16,500 US cities and towns (GeoNames). Zoom, pan, search, click states and cities, filter by visited / want to visit / not visited, mark cities from the map and watch the states fill in.
- **States and cities**: state pages with an outline map, your cities, progress through the largest cities, a photo gallery and notes. City pages with status, visit dates, rating, impression, tags, notes, a photo album, saved places on a locator map, the trips it belongs to and journal entries.
- **Photos**: uploads are validated, auto-rotated, stripped of GPS metadata and stored with WebP thumbnail (≤640px) and display (≤2048px) variants plus the original. Grid view, full-size viewer with keyboard/swipe, captions/dates/descriptions (EXIF capture date is read automatically), covers, drag-to-reorder, bulk select, albums (a photo can be in several albums without being copied), paged library.
- **Trips**: start/end dates, ordered itinerary with a route map, photos, notes, journal timeline. A city can be in many trips; the city record and its album are shared, never duplicated.
- **Journal**: entries with title, date, city, trip, multi-paragraph story, highlights, places visited, tags and attached photos; full-text-ish search and tag filters.
- **Places**: save restaurants, museums, cafés, parks and more on any city. Type a name or address and suggestions appear as you type (like Google Maps); pick one and the address, kind and pin fill in. You can also paste a Google Maps link. Places show on the main map, on a Places page, and open in Google Maps with one tap.
- **Sharing**: share a city's picks (or all favourites) as text, or as a read-only public link that works without an account. Links can be turned off any time in Settings.
- **Photos find their city**: a photo uploaded without a city (e.g. on the Albums page) is filed under the nearest city, within 25 km, using its GPS location.
- **Overview, wishlist, settings**: progress dashboard, wishlist grouped by state, JSON export, a full ZIP backup with original photos, restore from a backup (also from the GitHub Pages edition), and password change.
- **On a phone**: add it to the home screen (Safari → Share → *Add to Home Screen*) and it opens full-screen like an app.
- **Private by default**: password accounts with server-side sessions. Every query is scoped to the signed-in user, and photos are only ever served through an authenticated route.

## Two editions

| | Full app (repo root) | GitHub Pages edition (`site/`) |
| --- | --- | --- |
| Hosting | any Node.js host (Docker, Railway, Render, Vercel…) | GitHub Pages, free |
| Data | PostgreSQL + photo storage on a server | this browser only (IndexedDB) |
| Sign-in | password accounts | none needed; data never leaves the device |
| Multiple devices | yes | via backup ZIP export/import |

The Pages edition is published automatically by `.github/workflows/pages.yml`; see `site/README.md`.

## Stack

| Concern | Choice |
| --- | --- |
| App | Next.js 16 (App Router, server actions), React 19, TypeScript |
| Styling | Tailwind CSS 4, self-hosted Newsreader + Public Sans |
| Database | PostgreSQL 14+ with Drizzle ORM and SQL migrations (`drizzle/`) |
| Photos | `sharp` for processing; storage driver = local disk or any S3-compatible bucket (Supabase Storage, AWS S3, Cloudflare R2, MinIO…) |
| Map | MapLibre GL JS; boundaries from `us-atlas` (US Census Bureau cartographic boundaries); cities from `all-the-cities` (GeoNames, CC BY 4.0) |
| Auth | bcrypt password hashes, random session tokens (SHA-256 hashed in the DB), httpOnly SameSite cookies |
| Tests | Vitest (unit + database integration), Playwright (end-to-end) |

## Architecture

```
src/
  app/
    (auth)/login, signup         sign-in screens
    (app)/                        everything behind auth (layout calls requireUser)
      page.tsx                    the map (home)
      dashboard, states/[code], cities, cities/[id], trips, trips/[id],
      albums, albums/[id], journal, journal/new, journal/[id], journal/[id]/edit,
      wishlist, settings
    actions/                      server actions (validated with zod, owner-scoped)
    api/
      photos (GET page, POST upload), photos/[id]/[variant] (authenticated file serving)
      map/cities (reference cities, cached), map/status (your statuses + stats)
      search, export (JSON), export/archive (ZIP)
  components/                     map, photo gallery/viewer/uploader, forms, cards
  db/schema.ts                    Drizzle schema (source of truth for migrations)
  lib/                            auth, data access, storage drivers, image processing, validation
  proxy.ts                        redirects signed-out requests to /login (sessions are verified again in every page/action/route)
scripts/                          migrate, seed geo data, build the state GeoJSON
drizzle/                          generated SQL migrations
tests/unit, tests/e2e             automated tests
```

### Database schema

| Table | Purpose |
| --- | --- |
| `users`, `sessions` | accounts and server-side sessions (token hash, expiry) |
| `states` | 50 states + DC (DC is shown but not counted in “x of 50”), FIPS code, bounding box |
| `cities` | seeded GeoNames cities (`geoname_id`) plus towns a user adds (`created_by`) |
| `city_logs` | one row per user+city: status (`not_visited` / `want_to_visit` / `visited`), dates, rating, impression, notes, tags, cover photo |
| `state_logs` | per-user notes and cover photo for a state |
| `places` | saved restaurants, sights, activities… inside a city, optional coordinates |
| `trips`, `trip_stops` | trips and their ordered itinerary (stops reference the shared city row) |
| `photos` | one row per uploaded photo: optional city and trip, storage key, dimensions, dominant colour, capture date, caption, description, gallery position |
| `albums`, `album_photos` | albums and their ordered many-to-many photo membership |
| `journal_entries`, `journal_photos` | entries and their ordered attached photos |

All user tables cascade on user deletion. Deleting a photo clears any cover that pointed at it; deleting a trip, album or journal entry never deletes photos.

## Run it locally

Requirements: Node.js 20.9+ (22 recommended) and PostgreSQL 14+.

```bash
cp .env.example .env            # then edit DATABASE_URL
npm install                     # also copies MapLibre's worker into public/
createdb travel_journal         # or create it any other way
npm run db:setup                # runs migrations + loads states and ~16.5k cities (idempotent)
npm run dev                     # http://localhost:3000
```

The first person to open the app is sent to sign-up and becomes the owner. After that, sign-up is closed (set `ALLOW_SIGNUP=true` to allow more accounts; each account has its own private journal).

For local development over plain http, cookies work as-is on `localhost`. If you serve a production build over http on another host, set `SECURE_COOKIES=false`.

### Environment variables

See `.env.example` for the full annotated list.

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string |
| `DATABASE_SSL` | no | `true` for hosted databases that require TLS (Supabase, Neon, RDS) |
| `STORAGE_DRIVER` | no | `local` (default) or `s3` |
| `STORAGE_DIR` | no | local driver folder, default `./storage/uploads`. Must be persistent in production. |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | for `s3` | see below |
| `MAX_UPLOAD_MB` | no | default 25 |
| `ALLOW_SIGNUP` | no | default `false` once an owner exists |
| `SECURE_COOKIES` | no | default `true` in production |
| `NEXT_PUBLIC_MAP_STYLE_URL` | no | street basemap, baked in at build time. Default OpenFreeMap; `none` turns it off. See below |

## Photo storage

**Local disk** (default): files go to `STORAGE_DIR` as `<user>/<photo>/original.<ext>`, `display.webp`, `thumb.webp`. Use a persistent disk/volume in production (the Docker setup mounts one).

**Supabase Storage** (or any S3-compatible service):

1. In Supabase, open **Storage**, create a bucket (e.g. `photos`) and keep it **private**. Photos are always streamed through the app, which checks ownership.
2. Go to **Storage → Settings → S3 Connection**, enable it, and create an access key.
3. Set:
   ```
   STORAGE_DRIVER=s3
   S3_BUCKET=photos
   S3_ENDPOINT=https://<project-ref>.supabase.co/storage/v1/s3
   S3_REGION=<the region shown on that page>
   S3_ACCESS_KEY_ID=<access key id>
   S3_SECRET_ACCESS_KEY=<secret>
   S3_FORCE_PATH_STYLE=true
   ```
For AWS S3, leave `S3_ENDPOINT` empty and set `S3_FORCE_PATH_STYLE=false`. For Cloudflare R2 the endpoint is `https://<account-id>.r2.cloudflarestorage.com` and the region `auto`.

If the S3 settings are incomplete, uploads fail with a message naming the missing variables, and the Settings page shows the storage as misconfigured.

## The map and its data

- State boundaries: US Census Bureau cartographic boundary files, via the [`us-atlas`](https://github.com/topojson/us-atlas) package (1:10m). `npm run geo:build` regenerates `public/geo/states.json` from it.
- Cities: [GeoNames](https://www.geonames.org/) places with population ≥ 1,000 via [`all-the-cities`](https://github.com/zeke/all-the-cities) (neighbourhoods and abandoned places filtered out), loaded into the `cities` table by `npm run db:seed`. Smaller towns can be added from any state page by pinning them on a map.
- Map colours always come from the database: states are filled when you have a visited (or wishlisted) city in them; city dots are coloured by your saved status.

The map shows real streets and place names underneath your states and cities, from [OpenFreeMap](https://openfreemap.org) (free, no key). To use a different MapLibre style, set it before building:

```
NEXT_PUBLIC_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty          # more colourful OpenFreeMap style
NEXT_PUBLIC_MAP_STYLE_URL=https://api.maptiler.com/maps/dataviz-light/style.json?key=YOUR_KEY   # MapTiler
NEXT_PUBLIC_MAP_STYLE_URL=none                                                  # no street map
```
If the street map can't be loaded, the map quietly falls back to the built-in shapes.

Place suggestions while typing come from [Photon](https://photon.komoot.io) (OpenStreetMap data, no key); pressing Enter when suggestions are unavailable searches [Nominatim](https://nominatim.openstreetmap.org). Both are called from the browser.

## Backups and export

- **In the app**: Settings → *Download ZIP* (all data as `data.json` plus every original photo) or *Download JSON* (data only).
- **Server level**: `pg_dump "$DATABASE_URL" > travel-journal.sql` for the database, plus a copy of `STORAGE_DIR` (or your bucket, e.g. `aws s3 sync`/`rclone`).
- **Restore in the app**: Settings → *Restore from a backup* → choose a ZIP. This replaces the account's current data. ZIPs from the GitHub Pages edition (Settings → Download ZIP there) work too, which is how you move a browser-only journal to the server.
- Restore at server level: `psql "$DATABASE_URL" < travel-journal.sql` and put the photo files back at the same paths.

## Passwords

Change it in Settings → Password (other devices are signed out). If you forget it, run this where the app can reach the database (on Railway: the app service → *⋯* → *Shell*, or `railway run` locally):

```bash
npm run reset-password -- you@example.com "a new password of 10+ characters"
```

## Tests

```bash
npm test                 # Vitest: validation, geo data, image processing, storage driver,
                         # and database integration (stats, privacy scoping, search, trips, export).
                         # Uses TEST_DATABASE_URL (default postgres://postgres:postgres@localhost:5432/travel_journal_test),
                         # which is wiped and re-seeded on each run.
npm run build && npm run test:e2e
                         # Playwright against the production build on port 3100, using the test database:
                         # sign-up/login, map search and marking, state and city pages, uploads and
                         # validation errors, photo viewer and covers, places, albums, trips, journal,
                         # dashboard, export/ZIP, cross-account privacy, persistence across sign-in,
                         # type-ahead place search, share links, GPS filing, restore, password change, PWA.
E2E_DEV=1 npm run test:e2e   # same tests against `next dev` (no build needed)
```
Install Playwright's browser once with `npx playwright install chromium`.

## Deploy

**Docker on any VPS (simplest, everything persistent)**

```bash
POSTGRES_PASSWORD=$(openssl rand -hex 16) docker compose up -d --build
```
This runs Postgres and the app with named volumes for the database and photos; migrations and the geo seed run automatically on start. Put a TLS-terminating proxy (Caddy, nginx, Traefik) in front and point your domain at it. If you serve plain http, set `SECURE_COOKIES=false`.

**Render, Railway, Fly.io**: deploy the Dockerfile, attach a managed Postgres (`DATABASE_URL`, `DATABASE_SSL=true`), and either attach a persistent volume at `/app/storage/uploads` or use the `s3` driver.

**Vercel + Supabase**: works for the app and database, but serverless functions have no persistent disk, so you must use `STORAGE_DRIVER=s3` (Supabase Storage). Vercel also caps request bodies at about 4.5 MB, so set `MAX_UPLOAD_MB=4` there or self-host if you upload full-resolution photos. Run `npm run db:setup` once from your machine against the production `DATABASE_URL` (use Supabase's session pooler URL).

## Notes and limitations

- iPhone photos: the photo picker converts HEIC to JPEG automatically because the uploader only asks for JPEG/PNG/WebP/GIF. A HEIC file dragged in from a computer still can't be decoded; the uploader says so.
- Location filing reads GPS from the upload. The thumbnail and display copies contain no GPS metadata; the original file is kept exactly as uploaded and is only ever served to you.
- The S3 driver uses the standard AWS SDK commands and is covered by configuration tests, but it was not exercised against a live bucket while building this; the local driver is what the automated tests use. Try a test upload after configuring it.
- OpenFreeMap tiles, Photon and Nominatim were not reachable from the build environment. The OpenFreeMap style URL and Photon's API were checked against their documentation, and the tests use recorded responses; the fallback when they're unreachable is tested.
- Journal stories are plain multi-paragraph text (blank line = new paragraph) rather than a rich-text editor.
- If `next dev` keeps reloading after you ran `next build`, delete the `.next` folder and start it again.
