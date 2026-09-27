#!/usr/bin/env bash
# =============================================================================
#  Fimto Concrete ERP — encrypted daily backup of the production database
# =============================================================================
#  * Uses the official postgres image for pg_dump (no postgresql-client needed).
#  * Writes a plain SQL dump, gzips it, encrypts it with AES-256 (PBKDF2) and
#    keeps a rolling window (default 14 daily + 4 weekly).
#  * Verifies every backup by decrypting it and counting tables/rows, so a
#    silent, empty or corrupt dump can never be mistaken for a good backup.
#
#  Usage:  bash ~/.local/bin/fimto-backup [--keep N] [--verify-only FILE]
#  Restore: bash ~/.local/bin/fimto-restore <backup-file> [--target URL]
# =============================================================================
set -euo pipefail

HOME_DIR="$HOME"
CFG="$HOME_DIR/.config/fimto"
BACKUP_DIR="${FIMTO_BACKUP_DIR:-$HOME_DIR/Documents/concreete/backups}"
KEY_FILE="$CFG/backup.key"
DB_FILE="$CFG/backup_dburl"      # 600, never shown in a process list
KEEP="${FIMTO_BACKUP_KEEP:-14}"
IMAGE="postgres:17-alpine"   # must be >= the server major (Supabase runs 17)

log() { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ── first-run setup ──────────────────────────────────────────────────────────
mkdir -p "$CFG" "$BACKUP_DIR"
chmod 700 "$CFG"
if [ ! -f "$KEY_FILE" ]; then
  log "creating the backup encryption key (keep a copy of it safe!)"
  openssl rand -hex 32 > "$KEY_FILE"
  chmod 600 "$KEY_FILE"
fi
if [ ! -f "$DB_FILE" ]; then
  log "storing the database connection string (mode 600)"
  tr -d '\n' < "$HOME_DIR/.config/fimto_db_url" > "$DB_FILE"
  chmod 600 "$DB_FILE"
fi

# ── arguments ────────────────────────────────────────────────────────────────
if [ "${1:-}" = "--verify-only" ]; then
  exec bash "$(dirname "$0")/verify-backup.sh" "$2"
fi
while [ $# -gt 0 ]; do
  case "$1" in
    --keep) KEEP="$2"; shift 2 ;;
    *) die "unknown option: $1" ;;
  esac
done

# ── dump ─────────────────────────────────────────────────────────────────────
STAMP=$(date +%Y%m%d-%H%M%S)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
chmod 700 "$WORK"
cp "$DB_FILE" "$WORK/dburl"

log "pulling $IMAGE (once)"
docker pull -q "$IMAGE" >/dev/null

log "dumping the database with pg_dump"
docker run --rm -v "$WORK:/work:ro" --user "$(id -u):$(id -g)" \
  --env HOME=/tmp "$IMAGE" \
  sh -c 'pg_dump --dbname="$(cat /work/dburl)" --no-owner --no-acl --format=plain --clean --if-exists --schema=public' \
  > "$WORK/dump.sql" 2>"$WORK/dump.err" || {
    tail -n 5 "$WORK/dump.err" >&2
    die "pg_dump failed"
  }

BYTES=$(wc -c < "$WORK/dump.sql")
[ "$BYTES" -gt 20000 ] || { cat "$WORK/dump.err" >&2; die "dump is suspiciously small ($BYTES bytes)"; }

log "compressing and encrypting"
OUT="$BACKUP_DIR/fimto-$STAMP.sql.gz.enc"
gzip -9 -c "$WORK/dump.sql" \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$KEY_FILE" -out "$OUT"
chmod 600 "$OUT"

log "verifying the new backup (decrypt → count tables and rows)"
bash "$(dirname "$0")/verify-backup.sh" "$OUT" || die "verification failed — not trusting this backup"

# ── retention ────────────────────────────────────────────────────────────────
log "pruning old backups (keeping the newest $KEEP)"
ls -1t "$BACKUP_DIR"/fimto-*.sql.gz.enc 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r old; do
  rm -f "$old" && echo "  removed $(basename "$old")"
done

echo
echo "backup: $OUT ($(du -h "$OUT" | cut -f1))"
echo "restore: bash ~/.local/bin/fimto-restore $OUT"
