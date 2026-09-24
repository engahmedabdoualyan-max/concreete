#!/usr/bin/env bash
# ============================================================
#  Fimto ERP — Android APK + website release
# ============================================================
#  Prerequisites:
#    npm i -g eas-cli
#    eas login                 (or EXPO_TOKEN in the environment)
#    Vercel CLI linked to fimtosoft/concreete
#
#  Usage:
#    ./scripts/release-apk.sh "Release description"
#
#  Remote EAS builds must be downloaded with build:download.
#  --output is only valid for local EAS builds.
# ============================================================
set -euo pipefail

MSG="${1:-Release $(date +%F)}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE="$ROOT/website-app/apps/mobile"
SITE="$ROOT/website-app"
APK_NAME="fimto-android.apk"
APK_DEST="$SITE/public/downloads/$APK_NAME"
LIVE="https://concrete.fimtosoft.com"

command -v eas >/dev/null || { echo "❌ eas-cli is not installed"; exit 1; }
command -v vercel >/dev/null || { echo "❌ Vercel CLI is not installed"; exit 1; }

cd "$MOBILE"
echo "── 1/5 EAS cloud Android build ──"
# Do not pass --output here: it is rejected for remote builds.
eas build -p android --profile preview --non-interactive

echo "── Locating the finished build ──"
BUILD_JSON="$(eas build:list -p android --status finished --build-profile preview --limit 1 --json --non-interactive 2>/dev/null)"
BUILD_ID="$(printf '%s' "$BUILD_JSON" | node -e '
let s = "";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  const rows = JSON.parse(s);
  if (!Array.isArray(rows) || !rows[0]?.id) process.exit(1);
  process.stdout.write(rows[0].id);
});
')"
test -n "$BUILD_ID" || { echo "❌ Could not determine finished build ID"; exit 1; }
echo "✅ Build ID: $BUILD_ID"

echo "── 2/5 Downloading APK ──"
eas build:download --build-id "$BUILD_ID" --non-interactive
APK_DOWNLOADED="$(find /tmp "$HOME" -type f -name "${BUILD_ID}.apk" -print -quit 2>/dev/null || true)"
test -n "$APK_DOWNLOADED" || { echo "❌ Downloaded APK not found for $BUILD_ID"; exit 1; }
mkdir -p "$(dirname "$APK_DEST")"
cp "$APK_DOWNLOADED" "$APK_DEST"
test -s "$APK_DEST"
echo "✅ APK: $(du -h "$APK_DEST" | cut -f1)"

echo "── 3/5 Rebuild website (APK included) ──"
cd "$SITE"
npm run build
test -s "dist/downloads/$APK_NAME" || { echo "❌ APK missing from dist"; exit 1; }

echo "── 4/5 Deploy to LIVE project (concreete) ──"
vercel deploy --prod --yes

echo "── 5/5 Verify live ──"
curl -fsSL "$LIVE/" -o /tmp/fimto-live.html
grep -q "rndMgr" /tmp/fimto-live.html
grep -q "hrOfficer" /tmp/fimto-live.html
curl -fsSI "$LIVE/downloads/$APK_NAME" | grep -iE "HTTP/|content-type|content-length"

echo "✅ $MSG live at $LIVE"
echo "   Build: https://expo.dev/accounts/fimtosoft/projects/fimto-concrete-erp/builds/$BUILD_ID"
echo "   APK:   $LIVE/downloads/$APK_NAME"
