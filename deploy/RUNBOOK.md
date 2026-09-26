# Fimto Concrete — Runbook

Everything an operator needs, in one place. Written 2026-09-26.

## What is deployed where

| Piece | Where | Status |
|---|---|---|
| Website (Vite) | Vercel project `concreete` → `concreete.vercel.app` | ✅ live |
| Live domain | `concrete.fimtosoft.com` | owned by a different Vercel project (serves the Next build) |
| ERP API (151 Next.js routes) | **not hosted** — see "Hosting the API" | ✅ runs locally, DB connected |
| Desktop app (Linux) | `installers/fimto-app.deb` | ✅ v2.6.0 |
| Desktop app (Windows/macOS) | GitHub Actions | ⛔ blocked by GitHub billing |
| Android APK | `installers/fimto-android.apk` | ✅ |

## Hosting the API — pick one

The API has **151 serverless routes**; Vercel Hobby allows **12**. That is the
only reason it is not deployed.

### Option A — VPS (recommended: cheapest, most control)

Any Ubuntu 22.04/24.04 box (Oracle Free Tier included):

```bash
git clone <repo> /opt/fimto && cd /opt/fimto
sudo bash deploy/vps-deploy.sh          # installs node, systemd unit, nginx, TLS
sudo nano /etc/fimto/api.env            # paste the Supabase *pooler* URL + secrets
sudo systemctl restart fimto-api
curl https://<your-domain>/api/health
```

`deploy/vps-deploy.sh` does the whole job: Node 22, `npm ci` (which applies the
mobile patch-package step), a systemd service on port 3111, nginx serving the
built website **and** proxying `/api` to it, then certbot for TLS. One origin means
the browser never needs an API-base env var.

### Option B — Vercel Pro ($20/month)

Upgrade the plan, then the same Next app deploys as-is. After that set
`VITE_API_URL` (website) and `EXPO_PUBLIC_API_URL` (app) to
`https://<your-deployment>.vercel.app`.

### Temporary bridge (what runs today)

The API runs on the workstation and is exposed through a free Cloudflare tunnel:

```bash
bash ~/.local/bin/fimto-backend      # prints the public URL
curl "$URL/api/health"               # {"status":"healthy","database":"connected"}
```

It stops when the machine stops and the URL changes on every restart — fine for
testing, not for production.

## Pointing an app at a different server

Both the website and the mobile/desktop app read a **runtime** server URL, so no
rebuild is needed to move a plant to its own server:

- Website: the server-URL setting writes `fimto_server_url` in `localStorage`
- App: login screen → 🌐 السيرفر (إعدادات متقدمة) → paste the origin

## Desktop app builds

```bash
# Linux (local, ~4 min)
cd desktop-app-mobile/src-tauri
FIMTO_GDK_BACKEND=  docker run --rm -v "$PWD/../../..:/work" -v /tmp/cargo-cache:/root/.cargo/registry \
  fimto-tauri:24.04 bash -c 'cd /work/desktop-app-mobile/src-tauri && touch build.rs src/main.rs && cargo tauri build --bundles deb'

# Windows / macOS — GitHub Actions, tag-triggered
git tag -f desktop-v1.0.0 desktop-v1 && git push -f origin desktop-v1.0.0
```

Install on Linux: `sudo dpkg -i installers/fimto-app.deb`

## Why the web build needed a big layout fix

`react-native-web` never received its base `View` styles in this export, so every
`View` rendered as a `block` box. Tailwind utilities such as `flex-row` only set
`flex-direction`, so they did nothing, the navigator shrink-wrapped every screen
to ~180px, and the header was clipped. The fix is in
`website-app/apps/mobile/global.css` (base View styles + navigator fill + a
single scroll container) and in `app/_layout.tsx` (document direction follows the
selected language). Native-only components have `.web.tsx` fallbacks:
`PhotoCapture`, `SignaturePad`, `ReportBreakdownModal`, `MapLocationPicker`.

## CI

Both workflows were fixed (install scripts must run so the mobile patches apply;
timeout 20 → 45 min; Node 22). They still fail instantly with:

> The job was not started because recent account payments have failed or your
> spending limit needs to be increased.

Fix at <https://github.com/settings/billing>: set the Actions **spending limit**
to `$0` (unlimited) or update the failed payment method. Linux builds do not
need CI.
