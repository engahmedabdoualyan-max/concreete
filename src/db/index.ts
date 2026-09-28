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
/**
 * Transient-failure safe zone.
 *
 * The API runs against Supabase's transaction pooler on a free Render instance
 * that sleeps when idle. Both facts produce the same symptom: a pooled socket
 * that looks alive but is dead (pooler closed it, or the container woke up
 * with stale connections). pg then throws on the first query that lands on
 * that socket, which used to surface to the user as a random 401
 * ("Unable to validate session") or a bogus 404 from the customer portal.
 *
 * Fix, in three parts:
 *   1. detect dead connections before use (keepAlive + a short idle timeout)
 *   2. never let a background socket error kill the process
 *   3. retry once on a connection-level error — the next socket is fresh
 */
const TRANSIENT_DB_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EAI_AGAIN",
  "57P01", // admin_shutdown: the backend was restarted mid-query
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
  "08000", "08003", "08006", "08001", "08004", // connection exceptions
  "53300", // too_many_connections
]);

function isTransientDbError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (typeof code === "string" && TRANSIENT_DB_CODES.has(code)) return true;
  const message = (err as { message?: string } | null)?.message ?? "";
  return /terminat|closed|connection reset|connect ECONNREFUSED|socket hang up|server closed the connection/i.test(
    message,
  );
}

/**
 * Run a database operation, retrying once when the failure was the connection
 * rather than the query. Business errors are never retried, so this cannot
 * duplicate a write that already committed.
 */
export async function withDbRetry<T>(operation: () => Promise<T>, label = "db"): Promise<T> {
  try {
    return await operation();
  } catch (err) {
    if (!isTransientDbError(err)) throw err;
    console.warn(`[db] ${label}: transient connection error, retrying once —`, (err as Error).message);
    await new Promise((resolve) => setTimeout(resolve, 250));
    return await operation();
  }
}

function getPool(): Pool {
  if (realPool) return realPool;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required before using the database");
  }

  realPool =
    globalForDb.__arenaNextJsPostgresqlPool ??
    new Pool({
      connectionString: databaseUrl,
      // A small pool on purpose: the free instance and the transaction pooler
      // both punish large pools, and 5 keeps us clear of pooler limits.
      max: Number(process.env.DB_POOL_MAX ?? 5),
      // 1. close sockets the pooler may have dropped, before a query finds out
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
    });

  // 2. without a listener pg re-throws background socket errors as
  //    uncaught exceptions, which takes the whole process down.
  realPool.on("error", (err) => {
    console.error("[db] idle client error (recovered — the pool discards it):", err.message);
  });

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
