import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

type Database = ReturnType<typeof drizzle>;

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

let realPool: Pool | undefined;
let realDb: Database | undefined;

/**
 * Resolve the database lazily so Next can collect page data without opening a
 * production connection during `next build`. Any actual request/query still
 * fails closed when DATABASE_URL is missing.
 */
function getPool(): Pool {
  if (realPool) return realPool;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required before using the database");
  }

  realPool =
    globalForDb.__arenaNextJsPostgresqlPool ??
    new Pool({ connectionString: databaseUrl });

  if (process.env.NODE_ENV !== "production") {
    globalForDb.__arenaNextJsPostgresqlPool = realPool;
  }
  return realPool;
}

function getDb(): Database {
  if (!realDb) realDb = drizzle(getPool());
  return realDb;
}

/** Lazy proxy retained for callers that need the native pg Pool. */
export const pool = new Proxy({} as Pool, {
  get(_target, property) {
    const instance = getPool();
    const value = instance[property as keyof Pool];
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

/** Lazy Drizzle proxy: importing modules is safe; using a query requires DB config. */
export const db = new Proxy({} as Database, {
  get(_target, property) {
    const instance = getDb();
    const value = instance[property as keyof Database];
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
