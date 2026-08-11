/**
 * ============================================================
 *  FIMTO — Step 1: Unified-DB merge / source marker columns
 * ============================================================
 *  Idempotent. Adds a `source` marker to the tables that span
 *  both surfaces (app + website), per the architectural decision
 *  "unify tables with source distinction". Safe on any run count.
 *
 *    website_workspace.source      DEFAULT 'website'
 *   orders.source / clients.source DEFAULT 'app'
 *
 *  Usage: node scripts/add-source-column.ts
 * ============================================================
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const SITE_TABLES = ["website_workspace"]; // created/originated by the website
const APP_TABLES = ["orders", "clients"]; // core ERP tables both surfaces read/write

async function ensureColumn(p: any, schema: string, table: string, column: string, type: string, def: string, comment: string) {
  const exists = await p.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name=$3`,
    [schema, table, column]
  );
  if (exists.rows.length) {
    console.log(`  = (already present) ${schema}.${table}.${column}`);
    return;
  }
  await p.query(
    `ALTER TABLE "${schema}"."${table}" ADD COLUMN "${column}" ${type} NOT NULL DEFAULT ${def}`,
  );
  await p.query(
    `COMMENT ON COLUMN "${schema}"."${table}"."${column}" IS '${comment.replace(/'/g, "''")}'`,
  );
  console.log(`  + added ${schema}.${table}.${column} DEFAULT ${def}`);
}

async function addSourceMain() {
  const { Pool } = require("pg");
  const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  console.log("[source marker] website tables -> source='website'");
  for (const t of SITE_TABLES) {
    await ensureColumn(p, "public", t, "source", "varchar(20)", "'website'", "Origin surface: 'website' (Fimto website) | 'app' (mobile/ERP)");
  }
  console.log("[source marker] app/ERP tables -> source='app'");
  for (const t of APP_TABLES) {
    await ensureColumn(p, "public", t, "source", "varchar(20)", "'app'", "Origin surface: 'app' (mobile/ERP) | 'website' (Fimto website)");
  }
  await p.end();
  console.log("✓ Done. Run: node scripts/backup-db.ts again after code changes for a post-merge snapshot.");
}

addSourceMain().catch((e) => { console.error("ERR", e.message); process.exit(1); });
