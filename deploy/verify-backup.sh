#!/usr/bin/env bash
# Verify an encrypted Fimto database backup: decrypt it, then prove it really
# contains the schema and the data. Used after every backup so a broken dump
# can never pass as a good one.
#
# Usage: bash ~/.local/bin/fimto-verify-backup <backup-file>
set -euo pipefail

KEY_FILE="$HOME/.config/fimto/backup.key"
FILE="${1:?usage: fimto-verify-backup <backup-file>}"
[ -f "$FILE" ] || { echo "no such backup: $FILE" >&2; exit 1; }
[ -f "$KEY_FILE" ] || { echo "missing $KEY_FILE" >&2; exit 1; }

WORK=$(mktemp -d)
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$KEY_FILE" -in "$FILE" \
  | gunzip > "$WORK/dump.sql" || { echo "✗ cannot decrypt — wrong key or corrupt file" >&2; exit 1; }

TABLES=$(grep -ciE '^CREATE TABLE ' "$WORK/dump.sql" || true)
COPIES=$(grep -cE '^COPY ' "$WORK/dump.sql" || true)
ROWS=$(grep -cE '^\\\.$' "$WORK/dump.sql" || true)

# Rows actually present, per COPY block: count non-header data lines.
DATA_LINES=$(awk '/^COPY /{inblock=1; next} inblock && /^\\\.$/{inblock=0; next} inblock && NF{n++} END{print n+0}' "$WORK/dump.sql")
SIZE=$(wc -c < "$WORK/dump.sql")

printf '  tables        %s\n' "$TABLES"
printf '  copy blocks   %s\n' "$COPIES"
printf '  data rows     %s\n' "$DATA_LINES"
printf '  plain size    %s\n' "$(du -h "$WORK/dump.sql" | cut -f1)"

if [ "$TABLES" -lt 10 ]; then
  echo "✗ expected at least 10 tables, found $TABLES" >&2
  exit 1
fi
if [ "$DATA_LINES" -lt 1 ]; then
  echo "✗ the dump has no rows at all" >&2
  exit 1
fi
echo "  ✓ backup is readable and not empty"
