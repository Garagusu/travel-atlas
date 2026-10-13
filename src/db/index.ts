import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

declare global {
  var __tjPool: Pool | undefined;
}

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  return new Pool({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
}

// Reuse one pool across hot reloads in development.
const pool = globalThis.__tjPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalThis.__tjPool = pool;

export const db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });
export { pool, schema };
export type DB = typeof db;
