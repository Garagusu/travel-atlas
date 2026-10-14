import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

declare global {
  var __tjPool: Pool | undefined;
}

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // Don't fail on import: `next build` loads route modules without a database.
    // Any real query still fails with a clear message.
    const missing = new Pool();
    const fail = () => Promise.reject(new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in."));
    Object.assign(missing, { connect: fail, query: fail });
    return missing;
  }
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
