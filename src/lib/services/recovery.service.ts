/**
 * ============================================================
 *  FIMTO SOFT — Tenant recovery snapshots (point-in-time backup)
 * ============================================================
 *
 *  WHAT:  per-tenant logical backup of every table that carries a
 *         `tenant_id` column, stored as one timestamped JSON file per
 *         tenant:  backups/recovery/<tenantId>/YYYYMMDD-HHMMSS.json
 *
 *  WHY:   worst-case data loss is bounded by the snapshot interval
 *         (cron every 6h  →  at most ~6h of data at risk).
 *
 *  SECURITY:
 *   • The recovery password is NEVER stored. Only a scrypt hash in
 *     RECOVERY_PASSWORD_HASH (format: scrypt:<saltHex>:<keyHex>).
 *     Generate it locally with:  RECOVERY_PASSWORD=... node scripts/make-recovery-hash.mjs
 *   • Missing hash in production  →  every recovery route fails closed.
 *   • Restore additionally requires { confirmText: "RESTORE" }.
 *
 *  STORAGE NOTE: local filesystem (RECOVERY_DIR, default backups/).
 *  Vercel's filesystem is ephemeral — for production durability mount
 *  durable storage (S3 / Supabase Storage) and point RECOVERY_DIR at it.
 * ============================================================
 */

import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { db } from "@/db";
import { sql } from "drizzle-orm";

const scryptAsync = promisify(scryptCb);

const SNAPSHOT_VERSION = 1;
const FILE_RE = /^(\d{8})-(\d{6})\.json$/;
const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const INSERT_CHUNK = 200;

export interface RecoveryManifest {
  version: number;
  tenantId: string;
  createdAt: string;
  createdBy: string | null;
  tables: Record<string, number>;
  totalRows: number;
  sha256: string;
}

function recoveryDir(): string {
  const configured = process.env.RECOVERY_DIR?.trim();
  return path.resolve(process.cwd(), configured || "backups/recovery");
}

function retentionCount(): number {
  const raw = Number.parseInt(process.env.RECOVERY_RETENTION_COUNT ?? "28", 10);
  return Number.isFinite(raw) && raw >= 2 ? raw : 28;
}

function tenantDir(tenantId: string): string {
  const dir = path.join(recoveryDir(), tenantId);
  const base = recoveryDir();
  if (!dir.startsWith(base + path.sep)) throw new Error("INVALID_TENANT_PATH");
  return dir;
}

/** fail-closed gate: true only when a hash is configured. */
export function isRecoveryConfigured(): boolean {
  return Boolean(process.env.RECOVERY_PASSWORD_HASH?.trim());
}

function parseStoredHash(): { salt: Buffer; key: Buffer } {
  const raw = process.env.RECOVERY_PASSWORD_HASH?.trim() ?? "";
  const parts = raw.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") throw new Error("RECOVERY_NOT_CONFIGURED");
  const salt = Buffer.from(parts[1], "hex");
  const key = Buffer.from(parts[2], "hex");
  if (salt.length !== 16 || key.length !== 64) throw new Error("RECOVERY_NOT_CONFIGURED");
  return { salt, key };
}

/** Constant-time verification of the recovery password. Never throws on mismatch. */
export async function verifyRecoveryPassword(password: unknown): Promise<boolean> {
  try {
    if (typeof password !== "string" || password.length === 0) return false;
    const { salt, key } = parseStoredHash();
    const derived = (await scryptAsync(password, salt, 64)) as Buffer;
    return derived.length === key.length && timingSafeEqual(derived, key);
  } catch {
    return false;
  }
}

function quoteIdent(name: string): string {
  if (!IDENT_RE.test(name)) throw new Error(`UNSAFE_IDENTIFIER:${name}`);
  return `"${name}"`;
}

/** Bounded-parallel map: independent DB reads run concurrently. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Every base table in `public` that is scoped by tenant_id. */
export async function listTenantTables(): Promise<string[]> {
  const rows = await db.execute(sql`
    SELECT DISTINCT t.table_name AS "table"
    FROM information_schema.tables t
    JOIN information_schema.columns c
      ON c.table_schema = t.table_schema AND c.table_name = t.table_name
    WHERE t.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND c.column_name = 'tenant_id'
    ORDER BY 1
  `);
  return (rows.rows as Array<{ table: string }>)
    .map((r) => r.table)
    .filter((t) => IDENT_RE.test(t));
}

function reviveValue(value: unknown): unknown {
  if (
    value !== null &&
    typeof value === "object" &&
    (value as { type?: unknown }).type === "Buffer" &&
    Array.isArray((value as { data?: unknown }).data)
  ) {
    return Buffer.from((value as { data: number[] }).data);
  }
  return value ?? null;
}

/**
 * Snapshot every tenant-scoped row for one tenant.
 * Additive only — never modifies the database.
 * Table dumps run with bounded parallelism so a full snapshot
 * finishes in seconds, not minutes (proxy timeouts).
 */
export async function backupTenant(
  tenantId: string,
  createdBy: string | null,
  knownTables?: string[]
): Promise<RecoveryManifest> {
  const dir = tenantDir(tenantId);
  await fs.mkdir(dir, { recursive: true });

  const tables = knownTables ?? (await listTenantTables());
  const pairs = await mapLimit(tables, 8, async (table) => {
    const res = await db.execute(
      sql`SELECT * FROM ${sql.raw(quoteIdent(table))} WHERE ${sql.raw(quoteIdent("tenant_id"))} = ${tenantId}`
    );
    return [table, res.rows as unknown[]] as const;
  });
  const payload: Record<string, unknown[]> = {};
  let totalRows = 0;
  for (const [table, rows] of pairs) {
    payload[table] = rows;
    totalRows += rows.length;
  }

  const now = new Date();
  const stamp =
    `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}` +
    `-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
  const body = JSON.stringify({
    version: SNAPSHOT_VERSION,
    tenantId,
    createdAt: now.toISOString(),
    createdBy,
    tables: payload,
  });
  const sha256 = createHash("sha256").update(body).digest("hex");
  const fileName = `${stamp}.json`;
  await fs.writeFile(path.join(dir, fileName), body, "utf8");

  await pruneBackups(tenantId).catch(() => {
    // Pruning must never fail a successful backup.
  });

  const counts: Record<string, number> = {};
  for (const [t, rows] of Object.entries(payload)) counts[t] = rows.length;
  return { version: SNAPSHOT_VERSION, tenantId, createdAt: now.toISOString(), createdBy, tables: counts, totalRows, sha256 };
}

export interface BackupListing {
  file: string;
  createdAt: string;
  bytes: number;
}

/** Newest-first listing of a tenant's snapshots. */
export async function listBackups(tenantId: string): Promise<BackupListing[]> {
  const dir = tenantDir(tenantId);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out: BackupListing[] = [];
  for (const file of entries) {
    if (!FILE_RE.test(file)) continue;
    try {
      const st = await fs.stat(path.join(dir, file));
      if (!st.isFile()) continue;
      out.push({ file, createdAt: st.mtime.toISOString(), bytes: st.size });
    } catch {
      continue;
    }
  }
  return out.sort((a, b) => (a.file < b.file ? 1 : -1));
}

/**
 * Keep only the newest N snapshots. The just-written file is always newest,
 * so it is never pruned by its own backup call.
 */
export async function pruneBackups(tenantId: string): Promise<{ kept: number; removed: string[] }> {
  const keep = retentionCount();
  const all = await listBackups(tenantId);
  const removed: string[] = [];
  if (all.length > keep) {
    const dir = tenantDir(tenantId);
    for (const entry of all.slice(keep)) {
      try {
        await fs.unlink(path.join(dir, entry.file));
        removed.push(entry.file);
      } catch {
        // best-effort
      }
    }
  }
  return { kept: Math.min(all.length, keep), removed };
}

interface SnapshotFile {
  version: number;
  tenantId: string;
  createdAt: string;
  tables: Record<string, Record<string, unknown>[]>;
}

/**
 * Point-in-time restore: transactional per-table DELETE + re-INSERT of the
 * snapshot rows, then serial-sequence repair. Caller must verify the recovery
 * password and an explicit RESTORE confirmation BEFORE invoking.
 */
export async function restoreTenant(
  tenantId: string,
  file: string,
  actorUserId: string | null
): Promise<{ restoredTables: Record<string, number>; totalRows: number; snapshotAt: string }> {
  if (!FILE_RE.test(path.basename(file)) || file !== path.basename(file)) {
    throw new Error("INVALID_BACKUP_FILE");
  }
  const raw = await fs.readFile(path.join(tenantDir(tenantId), file), "utf8").catch(() => {
    throw new Error("BACKUP_NOT_FOUND");
  });
  let snap: SnapshotFile;
  try {
    snap = JSON.parse(raw) as SnapshotFile;
  } catch {
    throw new Error("CORRUPT_BACKUP");
  }
  if (snap.version !== SNAPSHOT_VERSION || snap.tenantId !== tenantId || !snap.tables || typeof snap.tables !== "object") {
    throw new Error("CORRUPT_BACKUP");
  }
  const tableNames = Object.keys(snap.tables).filter((t) => IDENT_RE.test(t));
  if (tableNames.length === 0) throw new Error("CORRUPT_BACKUP");

  // Serial (nextval) columns among the restored tables — repaired after insert.
  const serialRes = await db.execute(sql`
    SELECT table_name AS "table", column_name AS "column"
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_default LIKE 'nextval%'
  `);
  const serials = (serialRes.rows as Array<{ table: string; column: string }>).filter(
    (r) => tableNames.includes(r.table) && IDENT_RE.test(r.column)
  );

  const restoredTables: Record<string, number> = {};
  let totalRows = 0;

  await db.transaction(async (tx) => {
    for (const table of tableNames) {
      const rows = snap.tables[table] ?? [];
      await tx.execute(
        sql`DELETE FROM ${sql.raw(quoteIdent(table))} WHERE ${sql.raw(quoteIdent("tenant_id"))} = ${tenantId}`
      );
      if (rows.length === 0) {
        restoredTables[table] = 0;
        continue;
      }
      const columns = Object.keys(rows[0]).filter((c) => IDENT_RE.test(c));
      if (columns.length === 0) throw new Error(`CORRUPT_BACKUP_TABLE:${table}`);
      const colList = columns.map(quoteIdent).join(", ");
      for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        const chunk = rows.slice(i, i + INSERT_CHUNK);
        const values = chunk.map((row) => {
          const cells = columns.map((c) => sql`${reviveValue(row[c])}`);
          return sql`(${sql.join(cells, sql`, `)})`;
        });
        await tx.execute(
          sql`INSERT INTO ${sql.raw(quoteIdent(table))} (${sql.raw(colList)}) VALUES ${sql.join(values, sql`, `)}`
        );
      }
      restoredTables[table] = rows.length;
      totalRows += rows.length;
    }
    for (const s of serials) {
      await tx.execute(sql`
        SELECT setval(
          pg_get_serial_sequence(${s.table}, ${s.column}),
          COALESCE((SELECT MAX(${sql.raw(quoteIdent(s.column))}) FROM ${sql.raw(quoteIdent(s.table))}), 1)
        )
      `);
    }
  });

  void actorUserId;
  return { restoredTables, totalRows, snapshotAt: snap.createdAt };
}
