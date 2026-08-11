/**
 * ============================================================
 *  FIMTO — Full logical database backup (pg_dump replacement)
 * ============================================================
 *  Dumps schema DDL + row data for every table in the `public`
 *  schema (plus `realtime.messages` chat table) into a timestamped
 *  folder under backups/. Restorable via restore-db.ts.
 *
 *  Usage: node scripts/backup-db.ts
 * ============================================================
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");

const EXCLUDED_SCHEMAS = ["pg_catalog", "information_schema", "auth", "storage", "vault", "extensions", "drizzle", "supabase_migrations", "graphql", "graphql_public"];
const EXTRA_TABLES = ["realtime.messages"]; // chat — keep untouched but backed up

const OUT_DIR = path.join(__dirname, "..", "backups", new Date().toISOString().replace(/[:.]/g, "-"));

async function backupMain() {
  const { Pool } = require("pg");
  const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const tablesRes = await p.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema NOT IN ('${EXCLUDED_SCHEMAS.join("','")}')
      AND table_type = 'BASE TABLE'
    ORDER BY table_schema, table_name
  `);

  const targets: string[] = tablesRes.rows.map((t: any) => `${t.table_schema}.${t.table_name}`);
  for (const t of EXTRA_TABLES) if (!targets.includes(t)) targets.push(t);

  console.log(`Backing up ${targets.length} tables -> ${OUT_DIR}`);
  fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify({ takenAt: new Date().toISOString(), tables: targets, env: process.env.DATABASE_URL?.split("@")[0] }, null, 2));

  const ddl = [];
  for (const table of targets) {
    const [schema, name] = table.split(".");
    console.log(`  [${schema}.${name}] ...`);
    const cols = await p.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position
    `, [schema, name]);

    const pk = await p.query(`
      SELECT a.attname FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = ('"' || $1 || '"."' || $2 || '"')::regclass AND i.indisprimary
    `, [schema, name]);

    ddl.push(`-- Table: ${schema}.${name}`);
    ddl.push(`CREATE TABLE IF NOT EXISTS "${schema}"."${name}" (`);
    const colDefs = cols.rows.map((c: any) => {
      let d = `  "${c.column_name}" ${c.data_type}`;
      if (c.column_default) d += ` DEFAULT ${c.column_default}`;
      if (c.is_nullable === "NO") d += " NOT NULL";
      return d;
    });
    if (pk.rows.length) colDefs.push(`  PRIMARY KEY (${pk.rows.map((r: any) => `"${r.attname}"`).join(", ")})`);
    ddl.push(colDefs.join(",\n"));
    ddl.push(");\n");

    const count = await p.query(`SELECT count(*)::int AS n FROM "${schema}"."${name}"`);
    if (count.rows[0].n === 0) {
      fs.writeFileSync(path.join(OUT_DIR, `${schema}__${name}.json`), "[]\n");
      continue;
    }
    const data = await p.query(`SELECT * FROM "${schema}"."${name}"`);
    fs.writeFileSync(path.join(OUT_DIR, `${schema}__${name}.json`), JSON.stringify(data.rows, null, 1));
  }

  fs.writeFileSync(path.join(OUT_DIR, "schema.sql"), ddl.join("\n"));
  await p.end();
  console.log("✓ Backup complete:", OUT_DIR);
}

backupMain().catch((e) => { console.error("ERR", e.message); process.exit(1); });
