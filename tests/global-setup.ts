import { execSync } from "node:child_process";
import { Client } from "pg";

/** Recreates the test database schema and loads geographic data once per run. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/travel_journal_test";
  process.env.DATABASE_URL = url;
  const c = new Client({ connectionString: url });
  await c.connect();
  await c.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await c.end();
  const env = { ...process.env, DATABASE_URL: url };
  execSync("npx tsx scripts/migrate.ts", { env, stdio: "inherit" });
  execSync("npx tsx scripts/seed-geo.ts", { env, stdio: "inherit" });
}
