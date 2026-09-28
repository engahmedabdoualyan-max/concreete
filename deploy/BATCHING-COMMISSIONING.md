# Batching integration — commissioning guide

The plant integration has two halves:

1. **Read** what the controller is doing (state, progress, ticket weights).
2. **Write** — fire a batch remotely, and book the material the plant *actually*
   consumed into `inventory_silos` + `inventory_transactions`.

Half 1 works against any Modbus-TCP panel today. Half 2 is **deliberately locked**
until a plant is commissioned, because a mistyped register on a live plant costs
concrete and can damage equipment.

---

## What the code does

| File | Role |
|---|---|
| `src/lib/integrations/batch/modbus-tcp.ts` | dependency-free Modbus-TCP: FC03 read, **FC16** and **FC06** write |
| `src/lib/integrations/batch/controller.ts` | the provider contract, including `writeCommand` |
| `src/lib/integrations/batch/modbus.controller.ts` | MODBUS_TCP provider (register map driven) |
| `src/lib/integrations/batch/simulator.controller.ts` | SIMULATOR provider — same contract, no hardware |
| `src/lib/services/batch-execution.service.ts` | fire a batch · book the real consumption |
| `POST /api/plant/controllers/{id}/batch` | `action: "fire"` or `action: "record"` |

Without `allowRemoteWrite: true` in the controller settings, `fire` answers
`MANUAL_FIRE_REQUIRED` and the operator presses the batch on the vendor panel.
That is the default, on purpose.

---

## What to collect from the plant (one visit, one afternoon)

Ask the plant engineer or the vendor for these. With them, the integration is a
half-day of register mapping — not a project.

### 1. Which controller is it?

Common families: **Batic**, **Marcotte** (HTTP gateway), **Libra**,
**Schwing**, **L&T**, or a generic PLC behind a Modbus gateway.

- Modbus-TCP (default port 502) → the `MODBUS_TCP` provider.
- REST gateway with JSON → the `HTTP_GATEWAY` provider.

### 2. Network details

| Item | Example |
|---|---|
| Controller IP | `192.168.1.20` |
| Port | `502` |
| Unit / slave id | `1` |
| Protocol | Modbus-TCP (not RTU-over-TCP) |
| Is the ERP server on the same LAN/VPN? | yes/no |

> The API runs on Render (cloud), so it must **reach** the controller. Options,
> cheapest first:
> 1. the plant's own internet connection with a **static IP or a VPN** (Tailscale is free) into the plant LAN,
> 2. a small on-site agent (any PC on the plant LAN) that polls the panel and pushes readings to the API,
> 3. keep it read-only from the cloud and have the operator enter weights.

### 3. Register map

For each signal, the vendor gives a holding-register address and scale:

| Signal | Address | Scale | Unit | Notes |
|---|---|---|---|---|
| state | e.g. 40001 | — | 0 idle · 1 batching · 2 done · 3 alarm | required |
| progress % | e.g. 40002 | 1 | % | optional |
| ticket id | e.g. 40003 | 1 | — | optional |
| cement weight | e.g. 40010 | 0.1 | kg | per 1 m³ |
| sand weight | … | … | kg | |
| gravel 10/20/40 | … | … | kg | |
| water | … | … | kg or L | |
| admixture 1 / 2 | … | … | L | |
| fly ash / silica fume | … | … | kg | optional |
| **command: start batch** | e.g. 40020 | — | 1 | only for remote write |
| **command: design code** | e.g. 40021 | — | numeric | only for remote write |
| **command: target weights** | e.g. 40022… | 0.1 | kg | only for remote write |

All weights must be **per 1 m³**. The service multiplies by `batchSizeM3` when
firing a batch of a different size.

### 4. Commissioning before enabling writes

1. Configure the controller with the read map only, leave `allowRemoteWrite` off.
2. `POST /api/plant/controllers/{id}/test` → must be `ok: true`.
3. Compare the app's reading with the panel for **one full batch** — the numbers
   must match within the panel's own resolution.
4. Create one silo per material you want costed (`inventory_silos`), with
   `cost_sar_per_tonne` — this is what makes cost per m³ measured instead of
   estimated.
5. Only then set `allowRemoteWrite: true`, and test `action: "fire"` with a
   **scrap** mix, never with a customer order.
6. Book the consumption with `action: "record"` and check the silo balance in
   the plant's own stock report.

---

## Trying it without hardware

```bash
# 1. create a plant + a simulator controller (Settings → Plants in the app)
# 2. fire a batch
curl -X POST https://<api>/api/plant/controllers/<id>/batch \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"action":"fire","mixDesignId":"<uuid>","batchSizeM3":1}'
# 3. book what the plant reports
curl -X POST https://<api>/api/plant/controllers/<id>/batch \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"action":"record","ticketNumber":"T-1001","batchSizeM3":1}'
```

The end-to-end test (`npm run e2e`) does exactly this against the simulator and
asserts the silo is decremented by the *actual* weight and that re-booking the
same ticket is refused.

---

## What still needs a human decision

- **Which controller family and who holds the register documentation.**
- **How the cloud reaches the plant LAN** (VPN or an on-site agent).
- **Whether remote firing is acceptable on this plant at all** — many operators
  prefer to keep the panel as the only way to start a batch, and use the ERP
  purely to read the result. That is a supported configuration.
