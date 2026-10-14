#!/usr/bin/env bash
# =============================================================================
#  Fimto Concrete ERP — one-shot production deployment (VPS / Oracle / any Linux)
# =============================================================================
#  Usage (on the server, as a user with sudo):
#      git clone <repo> /opt/fimto && cd /opt/fimto
#      bash deploy/vps-deploy.sh
#
#  What it does:
#    1. Node 22 + pnpm-free npm ci (runs the mobile patch-package step)
#    2. systemd unit for the Next.js API (port 3111, env from /etc/fimto/api.env)
#    3. nginx: serves the built Vite website and reverse-proxies /api → 3111,
#       so the browser only ever talks to one origin (no CORS, no API base env)
#    4. TLS via certbot for your domain
#
#  Requirements: ubuntu 22.04/24.04, root or sudo, a domain pointing at the host.
# =============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/fimto}"
API_PORT="${API_PORT:-3111}"
SITE_PORT="${SITE_PORT:-8080}"
DOMAIN="${DOMAIN:-concrete.fimtosoft.com}"

log() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }

# ── 1. system packages ───────────────────────────────────────────────────────
log "Installing system packages"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  curl ca-certificates gnupg git nginx certbot python3-certbot-nginx \
  build-essential libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev \
  librsvg2-dev patchelf >/dev/null

# Node 22 (Next 16 needs >= 20.9)
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1)" -lt 22 ]; then
  log "Installing Node 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
node -v; npm -v

# ── 2. application dependencies ──────────────────────────────────────────────
log "Installing dependencies (this applies the mobile patches)"
cd "$APP_DIR"
npm ci --no-audit --no-fund

# ── 3. secrets file ──────────────────────────────────────────────────────────
if [ ! -f /etc/fimto/api.env ]; then
  log "Creating /etc/fimto/api.env — put the real secrets in it"
  install -d -m 750 /etc/fimto
  cat > /etc/fimto/api.env <<ENVFILE
# Supabase *pooler* URL (IPv4) — direct host is IPv6-only and will not connect.
DATABASE_URL=postgresql://USER:<password>@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
QR_SECRET=$(openssl rand -hex 32)
NODE_ENV=production
ENVFILE
  chmod 600 /etc/fimto/api.env
  echo "  → edit the DATABASE_URL before starting the service"
fi

# ── 4. systemd service for the API ───────────────────────────────────────────
log "Writing the systemd unit"
cat > /etc/systemd/system/fimto-api.service <<UNIT
[Unit]
Description=Fimto Concrete ERP API (Next.js)
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=$APP_DIR
EnvironmentFile=/etc/fimto/api.env
Environment=PORT=$API_PORT
ExecStart=/usr/bin/npx next start -p $API_PORT
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now fimto-api
sleep 6
curl -fsS "http://127.0.0.1:$API_PORT/api/health" && echo "  → API healthy"

# ── 5. build the website ─────────────────────────────────────────────────────
log "Building the website"
npm run build:site

# ── 6. nginx: website + /api on one origin ───────────────────────────────────
log "Writing the nginx site"
cat > /etc/nginx/sites-available/fimto <<NGINX
server {
    listen 80;
    server_name $DOMAIN;

    root $APP_DIR/website-app/dist;
    index index.html;

    # SPA fallback (expo-router style routes)
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # the ERP API — same origin, so the browser needs no API base env
    location /api/ {
        proxy_pass http://127.0.0.1:$API_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }

    location /_expo/ { expires 1y; add_header Cache-Control "public, immutable"; }
    location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
}
NGINX
ln -sf /etc/nginx/sites-available/fimto /etc/nginx/sites-enabled/fimto
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# ── 7. TLS ───────────────────────────────────────────────────────────────────
log "Requesting a TLS certificate for $DOMAIN"
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m admin@fimtosoft.com || \
  echo "  → certbot skipped (run it again once DNS points here)"

log "Done. Check: https://$DOMAIN/api/health"
