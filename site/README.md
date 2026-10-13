# Travel Atlas — GitHub Pages edition

A browser-only build of Travel Atlas that runs on GitHub Pages (no server, no database).

- Same map, states, cities, photos, albums, trips, journal and wishlist as the full app.
- **Everything is stored in your browser** (IndexedDB) on the device you use. Nothing is uploaded.
  Another device or browser starts with an empty journal.
- **Back up regularly**: *Backup* in the top bar downloads one ZIP with all data and photos.
  The same page restores a backup, which is also how you move the journal to another device.
- City list: GeoNames places with population ≥ 1,000 (CC BY 4.0); boundaries: US Census Bureau via us-atlas.

## Publish

The workflow in `.github/workflows/pages.yml` builds this folder and deploys it on every push to `main`.
One-time setup in the GitHub repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Free GitHub accounts can only publish Pages from **public** repositories.

The site works from any address (`https://<user>.github.io/` or `https://<user>.github.io/<repo>/`).

## Develop

```bash
cd site
npm install          # also copies MapLibre's worker into public/
npm run dev          # http://localhost:5173
npm run build        # outputs dist/
npx playwright test  # end-to-end tests against the built site served under /travel-atlas/
npm run data         # regenerate public/data from all-the-cities and the main app's states.json
```
