#!/usr/bin/env bash
# =============================================================================
#  Fimto Concrete ERP — restore the database from an encrypted backup
# =============================================================================
#  Usage:
#    bash ~/.local/bin/fimto-restore <backup-file>                     # dry run:
#                                                                       asks before
#                                                                       overwriting
#    bash ~/.local/bin/fimto-restore <backup-file> --target <pg-url>   # restore
#                                                                       into any
#                                                                       PostgreSQL
#                                                                       (a scratch
#                                                                       one for
#                                                                       tests, or
#                                                                       production
#                                                                       in a
#                                                                       disaster)
# =============================================================================
set -euo pipefail

KEY_FILE="$HOME/.config/fimto/backup.key"
IMAGE="postgres:17-alpine"
FILE="${1:?usage: fimto-restore <backup-file> [--target pg-url]}"
shift || true
TARGET=""
while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET="$2"; shift 2 ;;
    --target-from-config) TARGET="--target-from-config"; shift ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done

[ -f "$FILE" ] || { echo "no such backup: $FILE" >&2; exit 1; }
[ -f "$KEY_FILE" ] || { echo "missing $KEY_FILE" >&2; exit 1; }

echo "▸ checking the backup"
bash "$(dirname "$0")/verify-backup.sh" "$FILE"

if [ -z "$TARGET" ]; then
  cat <<EOF

Nothing was changed (dry run). To actually restore you must name a target:

  # a scratch database, to test that a backup really works:
  bash ~/.local/bin/fimto-restore "$FILE" --target 'postgresql://user:pass@host:5432/db'

  # production, in a real disaster (this DROPS and recreates every table).
  # The connection string is read from the 600-mode file so the password is
  # never printed in a terminal, a log or a screenshot:
  bash ~/.local/bin/fimto-restore "$FILE" --target-from-config

EOF
  exit 0
fi

if [ "$TARGET" = "--target-from-config" ]; then
  TARGET=$(tr -d '\n' < "$HOME/.config/fimto/backup_dburl")
  echo "▸ target: the configured production database (password not shown)"
fi

WORK=$(mktemp -d)
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT

echo "▸ decrypting"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$KEY_FILE" -in "$FILE" \
  | gunzip > "$WORK/dump.sql"

# Supabase ships platform extensions (supabase_vault, pg_cron, pg_net, ...) that
# do not exist on a plain PostgreSQL server and are provided by the platform
# itself on Supabase. Creating them is never necessary for restoring our data,
# so drop those statements instead of failing the whole restore on them.
PLATFORM_RE='supabase_vault|supabase_graphql|supabase_pg_notify|pg_cron|pg_net|pgjwt|pgsodium|realtime|graphql|pgmq|supautils|pg_stat_statements'
# Schemas that belong to the Supabase platform, not to our data. pg_dump --clean
# emits DROP SCHEMA for them, which fails on a plain PostgreSQL server because
# extensions live in them, and would be pointless on Supabase itself.
# The dump contains our `public` schema only, but pg_dump still emits the
# CREATE EXTENSION lines for extensions the database uses. Platform extensions
# that only exist on Supabase (pgjwt, supabase_vault, ...) are skipped so the
# restore also works on a plain PostgreSQL server. The filter is COPY-aware so
# no data line is ever touched.
PLATFORM_RE='supabase_vault|supabase_graphql|supabase_pg_notify|pg_cron|pg_net|pgjwt|pgsodium|realtime|graphql|pgmq|supautils'

awk -v ext="$PLATFORM_RE" '
  BEGIN { inblock = 0; skipped = 0 }
  /^COPY / { inblock = 1; print; next }
  inblock && /^\\\.$/ { inblock = 0; print; next }
  inblock { print; next }
  {
    if ($0 ~ /^(CREATE|DROP|ALTER|COMMENT)[[:space:]]/ && $0 ~ ext) { skipped++; next }
    print
  }
  END { print skipped > "/dev/stderr" }
' "$WORK/dump.sql" > "$WORK/restore.sql" 2>"$WORK/skipped.txt"
SKIPPED=$(cat "$WORK/skipped.txt")
[ "${SKIPPED:-0}" -gt 0 ] && echo "  skipped $SKIPPED platform extension statement(s)"

printf '%s' "$TARGET" > "$WORK/target"
chmod 600 "$WORK/target"

echo "▸ restoring into the target database"
echo "  (every table in the target is dropped and recreated)"
docker run --rm --network host -v "$WORK:/work:ro" --user "$(id -u):$(id -g)" --env HOME=/tmp "$IMAGE" \
  sh -c 'psql --dbname="$(cat /work/target)" -v ON_ERROR_STOP=1 --quiet -f /work/restore.sql' \
  && echo "✓ restore finished"

echo "▸ verifying what landed in the database"
docker run --rm --network host -v "$WORK:/work:ro" --user "$(id -u):$(id -g)" --env HOME=/tmp "$IMAGE" \
  sh -c 'psql --dbname="$(cat /work/target)" -At -c "
    select (select count(*) from information_schema.tables where table_schema = '\''public'\'') as tables,
           (select coalesce(sum(n_live_tup),0) from pg_stat_user_tables) as approx_rows;
  "'
