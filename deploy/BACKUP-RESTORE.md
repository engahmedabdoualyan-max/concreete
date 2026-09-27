# Database backup & restore (runbook)

The production database is PostgreSQL on Supabase. Nothing else in the stack
holds your data, so this is the most important operational script in the repo.

## What runs automatically

| What | When | Where |
|---|---|---|
| `fimto-db-backup.timer` | daily ~02:35 (20 min random jitter) | `~/Documents/concreete/backups/` |
| `fimto-keepalive.timer` | every 5 min | keeps the free Render instance awake |

Systemd user units: `~/.config/systemd/user/fimto-db-backup.{service,timer}`.
They run while the machine is logged in; `loginctl enable-linger` (needs root)
would also run them after logout.

## Backup

```bash
bash deploy/backup-db.sh --keep 14
```

* Dumps **only the `public` schema** (our data — the Supabase platform objects
  such as `realtime`, `vault`, `auth` are not ours and are not touched).
* Uses the official `postgres:17-alpine` image for `pg_dump`, so no
  `postgresql-client` install is needed. The image major must be >= the server
  major (Supabase currently runs 17).
* Compresses (gzip) and **encrypts with AES-256-CBC + PBKDF2 (200k iterations)**
  using `~/.config/fimto/backup.key` (mode 600, generated on first run).
* **Verifies itself**: decrypts the fresh file and fails the run unless it
  contains at least 10 tables and at least one data row.
* Keeps the newest 14 backups and prunes the rest.

Output looks like:

```
  tables        66
  copy blocks   66
  data rows     147
  ✓ backup is readable and not empty
backup: ~/Documents/concreete/backups/fimto-20260927-200239.sql.gz.enc (104K)
```

## Restore

```bash
# 1) check a backup without touching anything
bash deploy/restore-db.sh <backup-file>

# 2) prove a backup really works, on a throwaway database
docker run -d --name fimto-pgtest -e POSTGRES_PASSWORD=testpw -e POSTGRES_DB=restored -p 55432:5432 postgres:17-alpine
bash deploy/restore-db.sh <backup-file> --target 'postgresql://postgres:testpw@127.0.0.1:55432/restored'

# 3) production, in a real disaster (DROPS and recreates every table)
bash deploy/restore-db.sh <backup-file> --target-from-config
```

Step 2 is the one that matters: it is the actual recovery test, and it was run
successfully on 2026-09-27 (66 tables / 147 rows restored into a clean
database).

Platform-only `CREATE EXTENSION` statements (`pgjwt`, `supabase_vault`, …) are
skipped while restoring, so the restore works both on Supabase and on a plain
PostgreSQL server. The filter is COPY-block aware, so data lines are never
modified.

## If the encryption key is lost

Every backup becomes unreadable. Keep a copy of `~/.config/fimto/backup.key`
somewhere you trust (a password manager is ideal). There is deliberately no
recovery for a lost key.

## The connection string

`~/.config/fimto/backup_dburl` (mode 600) is used instead of passing the URL on
the command line, so the database password never appears in a process list, a
terminal scrollback, a log or a screenshot. Do not paste that URL into chat or
into a ticket.
