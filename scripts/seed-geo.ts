/**
 * Loads the geographic reference data: 50 states + DC (US Census boundaries
 * via us-atlas) and ~16,000 US cities and towns with population ≥ 1,000
 * (GeoNames via all-the-cities, CC BY 4.0). Idempotent — safe to re-run.
 * Run with: npm run db:seed
 */
import "dotenv/config";
import { createRequire } from "node:module";
import { geoBounds } from "d3-geo";
import { Pool } from "pg";
import { statesFeatureCollection } from "../src/lib/geo/boundaries";
import { REGION_VIEWS, STATE_BY_CODE } from "../src/lib/geo/states-meta";

const require = createRequire(import.meta.url);

type RawCity = {
  cityId: number;
  name: string;
  country: string;
  featureCode: string;
  adminCode: string;
  population: number;
  loc: { coordinates: [number, number] };
};

// Neighbourhoods, abandoned places and the like aren't cities.
const SKIP_FEATURE_CODES = new Set(["PPLX", "PPLQ", "PPLH", "PPLW", "PPLCH"]);

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  const client = await pool.connect();
  try {
    await client.query("begin");

    const fc = statesFeatureCollection(require("us-atlas/states-10m.json"));
    for (const f of fc.features) {
      const meta = STATE_BY_CODE.get(f.properties.code)!;
      let bbox: number[];
      if (meta.code === "AK") bbox = REGION_VIEWS.alaska.bounds;
      else {
        const [[w, s], [e, n]] = geoBounds(f);
        bbox = [w, s, e, n].map((v) => Math.round(v * 1e4) / 1e4);
      }
      await client.query(
        `insert into states (code, name, fips, is_state, bbox) values ($1,$2,$3,$4,$5)
         on conflict (code) do update set name = excluded.name, fips = excluded.fips,
           is_state = excluded.is_state, bbox = excluded.bbox`,
        [meta.code, meta.name, meta.fips, meta.isState, bbox],
      );
    }
    console.log(`states: ${fc.features.length}`);

    const all: RawCity[] = require("all-the-cities");
    const us = all.filter(
      (c) => c.country === "US" && STATE_BY_CODE.has(c.adminCode) && !SKIP_FEATURE_CODES.has(c.featureCode),
    );
    const BATCH = 1000;
    for (let i = 0; i < us.length; i += BATCH) {
      const chunk = us.slice(i, i + BATCH);
      const values: unknown[] = [];
      const rows = chunk.map((c, j) => {
        const b = j * 6;
        values.push(c.cityId, c.name, c.adminCode, c.loc.coordinates[1], c.loc.coordinates[0], c.population ?? 0);
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6})`;
      });
      await client.query(
        `insert into cities (geoname_id, name, state_code, lat, lon, population) values ${rows.join(",")}
         on conflict (geoname_id) do update set name = excluded.name, state_code = excluded.state_code,
           lat = excluded.lat, lon = excluded.lon, population = excluded.population`,
        values,
      );
    }
    console.log(`cities: ${us.length}`);
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
