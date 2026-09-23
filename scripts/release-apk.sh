#!/usr/bin/env bash
# ============================================================
#  Fimto ERP — One-command release (APK + website)
# ============================================================
#  Prerequisites (once):
#    npm i -g eas-cli && eas login
#    Expo project linked in website-app/apps/mobile (app.json projectId)
#
#  Usage:
#    ./scripts/release-apk.sh "وصف الإصدار"
#
#  Steps:
#    1. Cloud-build preview APK via EAS
#    2. Download it into website-app/public/downloads/
#    3. Rebuild the website (Vite) — dist picks up the APK automatically
#    4. Deploy to the LIVE `concreete` project (NOT deploy-site, NOT gh-pages)
#    5. Verify live bundle + APK headers
# ============================================================
set -euo pipefail

MSG="${1:-Release $(date +%F)}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE="$ROOT/website-app/apps/mobile"
SITE="$ROOT/website-app"
APK_NAME="fimto-android.apk"
APK_DEST="$SITE/public/downloads/$APK_NAME"
LIVE="https://concrete.fimtosoft.com"

echo "── 1/5 EAS cloud build (preview APK) ──"
cd "$MOBILE"
eas build -p android --profile preview --non-interactive --output="$APK_DEST" 2>/dev/null \
  || eas build -p android --profile preview
test -f "$APK_DEST" || { echo "❌ APK not found at $APK_DEST"; exit 1; }
echo "✅ APK: $(du -h "$APK_DEST" | cut -f1)"

echo "── 2/5 Rebuild website (APK inlined into dist) ──"
cd "$SITE"
npm run build
test -f "dist/downloads/$APK_NAME" || { echo "❌ APK missing from dist"; exit 1; }

echo "── 3/5 Deploy to LIVE project (concreete) ──"
echo "   Link check: project must be 'concreete' (concrete.fimtosoft.com)."
vercel deploy --prod --yes

echo "── 4/5 Verify live ──"
sleep 20
curl -sL "$LIVE/" -o /tmp/fimto-live.html
echo "   bundle: $(du -h /tmp/fimto-live.html | cut -f1)"
curl -sI "$LIVE/downloads/$APK_NAME" | grep -i "HTTP/\|content-length\|last-modified"

echo "── 5/5 Done ──"
echo "✅ $MSG live at $LIVE"
