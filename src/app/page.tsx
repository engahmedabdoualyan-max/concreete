import { db } from "@/db";
import { sql } from "drizzle-orm";
import Image from "next/image";

export const dynamic = "force-dynamic";

// ─── Badge component ───────────────────────────────────────────────────────────
function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide ${color}`}
    >
      {text}
    </span>
  );
}

// ─── Module card component ─────────────────────────────────────────────────────
function ModuleCard({
  icon,
  title,
  description,
  endpoints,
  roles,
  accent,
}: {
  icon: string;
  title: string;
  description: string;
  endpoints: { method: string; path: string; desc: string }[];
  roles: string[];
  accent: string;
}) {
  const methodColors: Record<string, string> = {
    GET: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
    POST: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
    PATCH: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
    DELETE: "bg-red-500/20 text-red-300 border border-red-500/30",
  };

  return (
    <div
      className={`relative rounded-2xl border ${accent} bg-slate-900/60 p-6 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/30`}
    >
      <div className="mb-4 flex items-start justify-between">
        <div>
          <span className="text-3xl">{icon}</span>
          <h3 className="mt-2 text-lg font-bold text-white">{title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-400">{description}</p>
        </div>
      </div>

      <div className="mb-4 space-y-1.5">
        {endpoints.map((ep, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg bg-slate-800/60 px-3 py-2">
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${methodColors[ep.method] ?? "bg-slate-700 text-slate-300"}`}
            >
              {ep.method}
            </span>
            <code className="flex-1 truncate text-xs text-orange-300">{ep.path}</code>
            <span className="truncate text-[11px] text-slate-500">{ep.desc}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {roles.map((r) => (
          <span
            key={r}
            className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-400"
          >
            {r}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Checkpoint step component ────────────────────────────────────────────────
function CheckpointStep({
  num,
  code,
  label,
  detail,
  isLast,
}: {
  num: number;
  code: string;
  label: string;
  detail: string;
  isLast?: boolean;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500 text-sm font-bold text-white shadow-lg shadow-orange-500/30">
          {num}
        </div>
        {!isLast && <div className="mt-1 h-full w-px bg-slate-700" />}
      </div>
      <div className="pb-6">
        <div className="flex items-center gap-2">
          <code className="rounded bg-slate-800 px-2 py-0.5 text-xs font-bold text-orange-300">
            {code}
          </code>
          <span className="font-semibold text-white">{label}</span>
        </div>
        <p className="mt-1 text-sm text-slate-400">{detail}</p>
      </div>
    </div>
  );
}

// ─── Schema table row ─────────────────────────────────────────────────────────
function SchemaRow({ table, desc, rows }: { table: string; desc: string; rows: string }) {
  return (
    <tr className="border-b border-slate-800 transition-colors hover:bg-slate-800/30">
      <td className="py-3 pr-4">
        <code className="text-sm font-semibold text-orange-300">{table}</code>
      </td>
      <td className="py-3 pr-4 text-sm text-slate-300">{desc}</td>
      <td className="py-3 text-xs text-slate-500">{rows}</td>
    </tr>
  );
}

export default async function HomePage() {
  let dbConnected = false;
  try {
    await db.execute(sql`SELECT 1`);
    dbConnected = true;
  } catch {
    dbConnected = false;
  }

  return (
    <main className="min-h-screen bg-slate-950">
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="/hero-bg.jpg"
            alt="Concrete plant"
            fill
            className="object-cover opacity-20"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/80 to-slate-950" />
        </div>

        <div className="relative mx-auto max-w-7xl px-6 pb-24 pt-16">
          {/* Top bar */}
          <div className="mb-12 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Image src="/logo.png" alt="Fimto Soft" width={48} height={48} className="rounded-xl" />
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-orange-400">
                  Fimto Soft
                </div>
                <div className="text-sm font-bold text-white">Concrete Plant ERP</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <a
                href="https://concrete.fimtosoft.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition-colors hover:border-orange-500 hover:text-orange-400 sm:block"
              >
                ↗ Web Platform
              </a>
              <div
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${dbConnected ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${dbConnected ? "animate-pulse bg-emerald-400" : "bg-red-400"}`}
                />
                DB {dbConnected ? "Connected" : "Offline"}
              </div>
            </div>
          </div>

          {/* Hero copy */}
          <div className="max-w-4xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-1.5 text-sm text-orange-300">
              <span>🏗️</span>
              <span>Multi-Role Mobile-First ERP — Ready-Mix Concrete Operations</span>
            </div>
            <h1 className="text-5xl font-black leading-tight text-white sm:text-6xl lg:text-7xl">
              Fimto Soft
              <span className="block bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-transparent">
                Concrete ERP
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-400">
              Production-grade backend architecture for Al-Sharqia Ready-Mix Concrete operations.
              Covers fleet dispatch, anti-fraud weighbridge governance, environment-compensated mix
              design, finance approval pipeline, and workshop management.
            </p>

            {/* Tech stack */}
            <div className="mt-8 flex flex-wrap gap-2">
              {[
                "Next.js 16",
                "TypeScript",
                "PostgreSQL",
                "Drizzle ORM",
                "JWT + RBAC",
                "SHA-256 Hash Chain",
                "Socket.io Ready",
                "Google Maps Ready",
              ].map((tech) => (
                <span
                  key={tech}
                  className="rounded-full border border-slate-700 bg-slate-800/50 px-3 py-1 text-xs font-medium text-slate-300"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>

          {/* Stat cards */}
          <div className="mt-16 grid grid-cols-2 gap-4 sm:grid-cols-5">
            {[
              { value: "24", label: "DB Tables", sub: "Fully relational" },
              { value: "7", label: "Trip Checkpoints", sub: "Real-time tracked" },
              { value: "4", label: "ERP Roles", sub: "RBAC enforced" },
              { value: "SHA-256", label: "Hash Chain", sub: "Anti-fraud ledger" },
              { value: "GPS", label: "Live Tracking", sub: "EMA geofence" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm"
              >
                <div className="text-3xl font-black text-orange-400">{stat.value}</div>
                <div className="mt-1 font-semibold text-white">{stat.label}</div>
                <div className="text-xs text-slate-500">{stat.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ROLES ──────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="mb-10">
          <h2 className="text-3xl font-black text-white">
            4 Access Roles{" "}
            <span className="text-orange-400">— RBAC Enforced</span>
          </h2>
          <p className="mt-2 text-slate-400">
            Every API endpoint validates JWT claims against the role permission matrix.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: "👑",
              role: "SUPER_ADMIN",
              color: "border-orange-500/40 bg-orange-500/5",
              tagColor: "bg-orange-500/20 text-orange-300",
              perms: [
                "All modules unrestricted",
                "Hash chain verification",
                "User management",
                "Live fleet tracking",
                "Evaluation dashboards",
              ],
            },
            {
              icon: "💳",
              role: "FINANCE",
              color: "border-blue-500/40 bg-blue-500/5",
              tagColor: "bg-blue-500/20 text-blue-300",
              perms: [
                "Order credit-check",
                "Electronic approval toggle",
                "Debt limit enforcement",
                "Manual override with paper clearance",
                "Finance audit trail",
              ],
            },
            {
              icon: "📱",
              role: "SALES_REP",
              color: "border-emerald-500/40 bg-emerald-500/5",
              tagColor: "bg-emerald-500/20 text-emerald-300",
              perms: [
                "Mobile order creation",
                "Site GPS geolocation",
                "Own order tracking",
                "Draft → PENDING_FINANCE only",
                "Client site lookup",
              ],
            },
            {
              icon: "🚛",
              role: "DRIVER",
              color: "border-purple-500/40 bg-purple-500/5",
              tagColor: "bg-purple-500/20 text-purple-300",
              perms: [
                "7-checkpoint timeline logging",
                "GPS coordinate capture",
                "Own trip management",
                "Breakdown self-reporting",
                "Fuel log recording",
              ],
            },
          ].map((r) => (
            <div key={r.role} className={`rounded-2xl border p-5 ${r.color}`}>
              <div className="mb-3 flex items-center gap-2">
                <span className="text-2xl">{r.icon}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.tagColor}`}>
                  {r.role}
                </span>
              </div>
              <ul className="space-y-1.5">
                {r.perms.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="mt-1 text-xs text-slate-500">▸</span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── API MODULES ─────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="mb-10">
          <h2 className="text-3xl font-black text-white">
            Core API Modules
          </h2>
          <p className="mt-2 text-slate-400">
            All routes use standardised JSON responses with{" "}
            <code className="text-orange-300">{"{ success, data, message, timestamp }"}</code>{" "}
            envelopes.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
          <ModuleCard
            icon="🚚"
            title="Dispatch Module"
            description="Smart scheduling, fleet pool management, curfew enforcement, and trip lifecycle."
            accent="border-orange-500/30"
            endpoints={[
              { method: "GET", path: "/api/dispatch", desc: "Fleet status dashboard" },
              { method: "POST", path: "/api/dispatch", desc: "Create & dispatch trip" },
              { method: "POST", path: "/api/dispatch/:id/checkpoint", desc: "Log checkpoint" },
              { method: "GET", path: "/api/dispatch/:id/checkpoint", desc: "Full timeline" },
            ]}
            roles={["SUPER_ADMIN", "DISPATCHER", "DRIVER"]}
          />

          <ModuleCard
            icon="💰"
            title="Finance Module"
            description="Credit limit enforcement, electronic approval toggle, debt-block pipeline."
            accent="border-blue-500/30"
            endpoints={[
              { method: "GET", path: "/api/finance", desc: "Finance dashboard + queue" },
              { method: "POST", path: "/api/finance/approve", desc: "Electronic approval" },
              { method: "POST", path: "/api/finance/reject", desc: "Reject with reason" },
            ]}
            roles={["SUPER_ADMIN", "FINANCE"]}
          />

          <ModuleCard
            icon="📦"
            title="Orders / Sales"
            description="Order creation by mobile sales reps → always enters PENDING_FINANCE gate."
            accent="border-emerald-500/30"
            endpoints={[
              { method: "GET", path: "/api/orders", desc: "List orders (role-filtered)" },
              { method: "POST", path: "/api/orders", desc: "Create order (→ PENDING_FINANCE)" },
            ]}
            roles={["SUPER_ADMIN", "FINANCE", "SALES_REP"]}
          />

          <ModuleCard
            icon="⚖️"
            title="Weighbridge"
            description="Anti-fraud SHA-256 hash-chain ledger. Net = Gross − Tare (programmatic only)."
            accent="border-red-500/30"
            endpoints={[
              { method: "GET", path: "/api/weighbridge", desc: "Recent transactions" },
              { method: "POST", path: "/api/weighbridge", desc: "Record transaction" },
              { method: "GET", path: "/api/weighbridge/verify", desc: "Chain integrity audit" },
            ]}
            roles={["SUPER_ADMIN", "DISPATCHER"]}
          />

          <ModuleCard
            icon="🔬"
            title="Quality / Lab"
            description="Slump tests, 7-day and 28-day strength, environment compensation preview."
            accent="border-purple-500/30"
            endpoints={[
              { method: "GET", path: "/api/quality", desc: "QC dashboard + pending tests" },
              { method: "POST", path: "/api/quality", desc: "Record lab sample" },
              { method: "POST", path: "/api/quality/:id/result", desc: "Record strength result" },
              { method: "POST", path: "/api/quality/environment-compensation", desc: "Compute correction" },
            ]}
            roles={["SUPER_ADMIN", "LAB_TECHNICIAN"]}
          />

          <ModuleCard
            icon="🔧"
            title="Workshop"
            description="Preventive/corrective maintenance, dispatch isolation, fuel theft detection."
            accent="border-amber-500/30"
            endpoints={[
              { method: "GET", path: "/api/workshop", desc: "Open WOs + fleet health" },
              { method: "POST", path: "/api/workshop", desc: "Create work order" },
              { method: "POST", path: "/api/workshop/:id/close", desc: "Close WO + restore vehicle" },
              { method: "GET", path: "/api/workshop/fuel", desc: "Fuel logs + anomalies" },
              { method: "POST", path: "/api/workshop/fuel", desc: "Record fuel log" },
            ]}
            roles={["SUPER_ADMIN", "WORKSHOP_MECHANIC", "DRIVER"]}
          />

          <ModuleCard
            icon="🏭"
            title="Fleet Management"
            description="Vehicle registry with tare weights, drum capacity, status, and driver assignments."
            accent="border-slate-500/30"
            endpoints={[
              { method: "GET", path: "/api/fleet", desc: "All vehicles + status" },
              { method: "POST", path: "/api/fleet", desc: "Register vehicle" },
            ]}
            roles={["SUPER_ADMIN", "DISPATCHER"]}
          />

          <ModuleCard
            icon="🏗️"
            title="Inventory / Silos"
            description="Raw material stock levels, auto-deduction on batch, low-stock alerts."
            accent="border-teal-500/30"
            endpoints={[
              { method: "GET", path: "/api/inventory", desc: "Stock levels + alerts" },
              { method: "POST", path: "/api/inventory", desc: "Record receipt" },
            ]}
            roles={["SUPER_ADMIN", "LAB_TECHNICIAN", "DISPATCHER"]}
          />

          <ModuleCard
            icon="🔐"
            title="Auth & Sessions"
            description="JWT + refresh token rotation, session revocation, RBAC middleware."
            accent="border-rose-500/30"
            endpoints={[
              { method: "POST", path: "/api/auth/login", desc: "Login → token pair" },
              { method: "POST", path: "/api/auth/logout", desc: "Revoke session" },
              { method: "POST", path: "/api/auth/refresh", desc: "Rotate tokens" },
            ]}
            roles={["All Roles"]}
          />
        </div>
      </section>

      {/* ── 7-CHECKPOINT TIMELINE ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-black text-white">
              7-Checkpoint Trip Timeline
            </h2>
            <p className="mt-3 text-slate-400">
              Every delivery trip follows a mandatory sequential checkpoint progression.
              Each step is logged with GPS coordinates, timestamps, and metadata.
              Socket.io broadcasts real-time updates to all connected departments.
            </p>

            <div className="mt-8">
              <CheckpointStep
                num={1}
                code="ARR_PLANT"
                label="Arrival at Plant"
                detail="Driver checks in. Trip cycle begins. Vehicle status → LOADING."
              />
              <CheckpointStep
                num={2}
                code="ARR_BSTC"
                label="Entry Under Batch Plant"
                detail="Drum positioned under batching plant. Raw material deduction from inventory silos."
              />
              <CheckpointStep
                num={3}
                code="DEP_PLANT"
                label="Gate Departure"
                detail="Weighbridge LOAD_OUT recorded with SHA-256 hash. Digital Delivery Ticket generated. Vehicle → IN_TRANSIT."
              />
              <CheckpointStep
                num={4}
                code="ARR_SITE"
                label="Arrival at Customer Site"
                detail="Background geofencing triggers auto-log. GPS verified against site coordinates."
              />
              <CheckpointStep
                num={5}
                code="POUR_START"
                label="Pour / Pump Hook-up"
                detail="Linked to concrete pump code (e.g. P01). Lab technician notified. Vehicle → POURING."
              />
              <CheckpointStep
                num={6}
                code="DEP_SITE"
                label="Site Departure"
                detail="On-site duration calculated. Transit time metric computed. Vehicle → RETURNING."
              />
              <CheckpointStep
                num={7}
                code="RETURN_PLANT"
                label="Return to Plant"
                detail="Total cycle time closed. Vehicle reset to AVAILABLE. Order remaining volume updated."
                isLast
              />
            </div>
          </div>

          {/* Database schema table */}
          <div>
            <h2 className="text-3xl font-black text-white">
              Database Schema
              <span className="text-orange-400"> — 13 Tables</span>
            </h2>
            <p className="mt-3 mb-6 text-slate-400">
              Production-grade Drizzle ORM schema with enums, indexes, foreign keys, and hash-chain integrity.
            </p>

            <div className="overflow-hidden rounded-2xl border border-slate-800">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80">
                    <th className="py-3 pl-4 pr-4 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
                      Table
                    </th>
                    <th className="py-3 pr-4 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
                      Purpose
                    </th>
                    <th className="py-3 pr-4 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
                      Key Feature
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-slate-900/40 pl-4">
                  <SchemaRow
                    table="users"
                    desc="Identity + RBAC"
                    rows="bcrypt hash, JWT JTI, push tokens"
                  />
                  <SchemaRow
                    table="user_sessions"
                    desc="Session revocation"
                    rows="JTI tracking, device info"
                  />
                  <SchemaRow
                    table="clients"
                    desc="Customer master"
                    rows="Credit limit, blacklist flag"
                  />
                  <SchemaRow
                    table="delivery_sites"
                    desc="Pour locations"
                    rows="GPS lat/lng, geofence radius"
                  />
                  <SchemaRow
                    table="fleet_vehicles"
                    desc="All fleet assets"
                    rows="Tare weight, drum capacity, status"
                  />
                  <SchemaRow
                    table="mix_designs"
                    desc="Concrete recipes"
                    rows="Env compensation algorithm params"
                  />
                  <SchemaRow
                    table="inventory_silos"
                    desc="Raw material stock"
                    rows="Auto-deduction on batch start"
                  />
                  <SchemaRow
                    table="orders"
                    desc="Sales pipeline"
                    rows="Status FSM, finance approval gate"
                  />
                  <SchemaRow
                    table="trips"
                    desc="Delivery loads"
                    rows="7-checkpoint tracker, DDT"
                  />
                  <SchemaRow
                    table="weighbridge_txns"
                    desc="Weight ledger"
                    rows="SHA-256 hash chain, append-only"
                  />
                  <SchemaRow
                    table="lab_test_samples"
                    desc="QC sampling"
                    rows="Slump, 7-day, 28-day cubes"
                  />
                  <SchemaRow
                    table="maintenance_orders"
                    desc="Workshop WOs"
                    rows="Dispatch isolation on OPEN"
                  />
                  <SchemaRow
                    table="fuel_logs"
                    desc="Fuel tracking"
                    rows="Anomaly detection, theft flag"
                  />
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ── WEIGHBRIDGE GOVERNANCE ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="rounded-3xl border border-red-500/20 bg-gradient-to-br from-red-950/30 to-slate-900/60 p-8 backdrop-blur-sm">
          <div className="flex items-start gap-4">
            <div className="shrink-0 rounded-2xl bg-red-500/20 p-3 text-3xl">⛓️</div>
            <div className="flex-1">
              <h2 className="text-2xl font-black text-white">
                Anti-Fraud Weighbridge Governance
              </h2>
              <p className="mt-2 text-slate-400">
                SHA-256 blockchain-like hash chains guarantee weight records cannot be retroactively
                altered.
              </p>

              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-900/60 p-4">
                  <div className="mb-2 font-bold text-white">Net Weight Formula</div>
                  <code className="block rounded bg-slate-800 p-3 text-sm text-orange-300">
                    Net = Gross − Tare
                    <br />
                    <span className="text-slate-500">// Always programmatic</span>
                    <br />
                    <span className="text-slate-500">// Never manual input</span>
                  </code>
                </div>
                <div className="rounded-xl bg-slate-900/60 p-4">
                  <div className="mb-2 font-bold text-white">Hash Computation</div>
                  <code className="block rounded bg-slate-800 p-3 text-sm text-emerald-300">
                    SHA256(
                    <br />
                    &nbsp;&nbsp;id | tripId | seq |
                    <br />
                    &nbsp;&nbsp;type | gross | tare |
                    <br />
                    &nbsp;&nbsp;net | ts | prevHash
                    <br />)
                  </code>
                </div>
                <div className="rounded-xl bg-slate-900/60 p-4">
                  <div className="mb-2 font-bold text-white">Chain Verification</div>
                  <div className="space-y-2 text-sm text-slate-300">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400">✓</span> Recompute every hash
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400">✓</span> Verify previousHash links
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400">✓</span> Report first breach point
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400">✓</span> Audit log verification runs
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── ENV COMPENSATION ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="rounded-3xl border border-amber-500/20 bg-gradient-to-br from-amber-950/20 to-slate-900/60 p-8">
          <div className="flex items-start gap-4">
            <div className="shrink-0 rounded-2xl bg-amber-500/20 p-3 text-3xl">🌡️</div>
            <div className="flex-1">
              <h2 className="text-2xl font-black text-white">
                Al-Sharqia Environment Compensation Algorithm
              </h2>
              <p className="mt-2 text-slate-400">
                Extreme heat (up to 50°C) in Eastern Province accelerates concrete hydration.
                The system dynamically adjusts water, retarder, and plasticiser dosages per batch.
              </p>

              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    label: "Water Adjustment",
                    formula: "baseWater + (ΔT × 0.5L/°C)",
                    desc: "More water per °C above base design temp",
                    color: "text-blue-300",
                  },
                  {
                    label: "Retarder Boost",
                    formula: "baseRetarder + (ΔT × 0.02L/°C)",
                    desc: "Slows hydration to survive hot transit",
                    color: "text-amber-300",
                  },
                  {
                    label: "W/C Ratio Cap",
                    formula: "water ≤ maxWC × cement",
                    desc: "Ceiling enforced; plasticiser compensates",
                    color: "text-red-300",
                  },
                  {
                    label: "Slump Forecast",
                    formula: "target − (transit/10 × 0.8cm)",
                    desc: "Warns if estimated site slump < 8cm",
                    color: "text-emerald-300",
                  },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl bg-slate-900/60 p-4">
                    <div className="mb-1 font-semibold text-white">{item.label}</div>
                    <code className={`block text-xs ${item.color}`}>{item.formula}</code>
                    <p className="mt-2 text-xs text-slate-500">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── DEEP BUSINESS LOGIC MODULES ───────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="mb-10">
          <h2 className="text-3xl font-black text-white">
            Deep Business Logic
            <span className="text-orange-400"> — Phase 2</span>
          </h2>
          <p className="mt-2 text-slate-400">
            Mathematical algorithms, atomic transactions, and real-time pipelines
            powering the ERP's critical workflows.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-blue-500/30 bg-slate-900/60 p-6">
            <h3 className="mb-2 flex items-center gap-2 text-lg font-bold text-white">
              <span>📡</span> Real-Time GPS Pipeline
            </h3>
            <p className="mb-4 text-sm text-slate-400">
              Socket.io event handlers for{" "}
              <code className="text-blue-300">driver:location_update</code>,
              with EMA smoothing and geofence auto-trigger.
            </p>
            <div className="space-y-2 text-xs">
              <div className="rounded bg-slate-800/60 p-2 font-mono text-blue-300">
                EMA_new = 0.4 × speed + 0.6 × EMA_old
              </div>
              <div className="rounded bg-slate-800/60 p-2 font-mono text-emerald-300">
                haversine(lat,lng) ≤ site.geofenceRadius + 20m → ARR_SITE
              </div>
              <div className="rounded bg-slate-800/60 p-2 font-mono text-amber-300">
                broadcast throttle: max 1 emit/vehicle per 5s
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-red-500/30 bg-slate-900/60 p-6">
            <h3 className="mb-2 flex items-center gap-2 text-lg font-bold text-white">
              <span>⛓️</span> SHA-256 Anti-Fraud Ledger + Returns
            </h3>
            <p className="mb-4 text-sm text-slate-400">
              Hash chain verification, concrete returns with recovery stats
              (blocks cast, aggregate recycled, water recovered).
            </p>
            <div className="space-y-2 text-xs">
              <div className="rounded bg-slate-800/60 p-2 font-mono text-red-300">
                SHA256(id|trip|seq|gross|tare|net|ts|prevHash)
              </div>
              <div className="rounded bg-slate-800/60 p-2 font-mono text-orange-300">
                CAST_BLOCKS → block_manufacturing_logs
              </div>
              <div className="rounded bg-slate-800/60 p-2 font-mono text-amber-300">
                RECYCLED → inventory_silos credit (1-way)
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-500/30 bg-slate-900/60 p-6">
            <h3 className="mb-2 flex items-center gap-2 text-lg font-bold text-white">
              <span>🧪</span> Atomic StartBatch + Reorder Triggers
            </h3>
            <p className="mb-4 text-sm text-slate-400">
              Single atomic transaction: validate ALL silos → SELECT FOR UPDATE
              → decrement → log → auto-generate PR if below reorder level.
            </p>
            <div className="space-y-2 text-xs">
              <div className="rounded bg-slate-800/60 p-2 font-mono text-amber-300">
                IF any silo &lt; required → ROLLBACK entire batch
              </div>
              <div className="rounded bg-slate-800/60 p-2 font-mono text-emerald-300">
                IF stock &lt; reorder_level → AUTO-PR
              </div>
              <div className="rounded bg-slate-800/60 p-2 font-mono text-blue-300">
                orderQty = reorderLevel × 1.5 − currentStock
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-purple-500/30 bg-slate-900/60 p-6">
            <h3 className="mb-2 flex items-center gap-2 text-lg font-bold text-white">
              <span>💳</span> Credit Hold + Accountant Override
            </h3>
            <p className="mb-4 text-sm text-slate-400">
              Order → PENDING_FINANCE → auto-evaluated →{" "}
              <code className="text-purple-300">CREDIT_HOLD</code> if over limit.
              Manual accountant toggle REQUIRED (paper alone invalid).
            </p>
            <div className="space-y-2 text-xs">
              <div className="rounded bg-slate-800/60 p-2 font-mono text-purple-300">
                headroom = limit − outstanding − pendingOrders
              </div>
              <div className="rounded bg-slate-800/60 p-2 font-mono text-amber-300">
                IF order &gt; headroom → CREDIT_HOLD (override-able)
              </div>
              <div className="rounded bg-slate-800/60 p-2 font-mono text-red-300">
                IF blacklisted → REJECT (hard block, no override)
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-500/30 bg-slate-900/60 p-6">
            <h3 className="mb-2 flex items-center gap-2 text-lg font-bold text-white">
              <span>🔧</span> Curfew Guard Middleware
            </h3>
            <p className="mb-4 text-sm text-slate-400">
              Intercepts scheduling engine, checks global{" "}
              <code className="text-emerald-300">curfew_zones</code> +
              site-specific traffic windows.
            </p>
            <div className="space-y-2 text-xs">
              <div className="rounded bg-slate-800/60 p-2 font-mono text-emerald-300">
                morning 06-09, evening 15-19 (Sun-Thu)
              </div>
              <div className="rounded bg-slate-800/60 p-2 font-mono text-amber-300">
                Friday prayer 11-13, Sat night 22-05
              </div>
              <div className="rounded bg-slate-800/60 p-2 font-mono text-blue-300">
                blocking=true → reject with suggested reschedule
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-rose-500/30 bg-slate-900/60 p-6">
            <h3 className="mb-2 flex items-center gap-2 text-lg font-bold text-white">
              <span>🚨</span> Severity-Based Vehicle Isolation
            </h3>
            <p className="mb-4 text-sm text-slate-400">
              Maintenance orders with <code className="text-rose-300">severity=CRITICAL</code>
              {" "}immediately mark vehicle as IN_WORKSHOP, excluding it from the dispatch pool.
            </p>
            <div className="space-y-2 text-xs">
              <div className="rounded bg-slate-800/60 p-2 font-mono text-rose-300">
                LOW/MEDIUM → STANDBY (still dispatchable)
              </div>
              <div className="rounded bg-slate-800/60 p-2 font-mono text-amber-300">
                HIGH/CRITICAL → IN_WORKSHOP (excluded)
              </div>
              <div className="rounded bg-slate-800/60 p-2 font-mono text-red-300">
                isMajorBreakdown → MAJOR_BREAKDOWN
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── NEW API ENDPOINTS ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <h2 className="mb-6 text-3xl font-black text-white">
          New Phase 2 Endpoints
        </h2>
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Method
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Route
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Purpose
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                { m: "POST", p: "/api/dispatch/:tripId/live-location", d: "GPS stream → EMA speed + geofence auto-trigger" },
                { m: "POST", p: "/api/finance/evaluate-credit", d: "Pre-flight credit check for client + order value" },
                { m: "POST", p: "/api/finance/:orderId/override", d: "Accountant digital toggle for CREDIT_HOLD orders" },
                { m: "POST", p: "/api/batching/start", d: "Atomic batch start + reorder PR generation" },
                { m: "POST", p: "/api/returns", d: "Log return with CAST_BLOCKS / RECYCLED / WASHOUT recovery" },
                { m: "GET",  p: "/api/returns", d: "Sustainability dashboard — recycling rates, blocks cast" },
              ].map((ep) => (
                <tr key={ep.p + ep.m} className="border-b border-slate-800 transition-colors hover:bg-slate-800/30">
                  <td className="px-4 py-3">
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      {ep.m}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-orange-300">{ep.p}</td>
                  <td className="px-4 py-3 text-sm text-slate-300">{ep.d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── MOBILE APP ──────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-1.5 text-sm text-orange-300">
              <span>📱</span>
              <span>تطبيق الجوال الميداني</span>
            </div>
            <h2 className="text-3xl font-black text-white sm:text-4xl">
              Mobile Field App
              <span className="block text-orange-400">React Native</span>
            </h2>
            <p className="mt-4 text-lg text-slate-400">
              تطبيق ميداني موحد للسائقين ومندوبي المبيعات. واجهات بسيطة ومباشرة مع أزرار كبيرة سهلة الاستخدام في الميدان.
            </p>

            <div className="mt-8 space-y-4">
              <div className="flex items-start gap-4 rounded-2xl border border-orange-500/20 bg-slate-900/60 p-5">
                <span className="text-3xl">🚚</span>
                <div>
                  <h3 className="text-lg font-bold text-white">واجهة السائق</h3>
                  <p className="text-sm text-slate-400">
                    بطاقة رحلة كبيرة مع زر واحد ديناميكي لتسجيل البوابات السبعة. تتبع GPS مستمر حتى مع إغلاق الشاشة.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 rounded-2xl border border-blue-500/20 bg-slate-900/60 p-5">
                <span className="text-3xl">💼</span>
                <div>
                  <h3 className="text-lg font-bold text-white">واجهة المندوب</h3>
                  <p className="text-sm text-slate-400">
                    نموذج طلب بسيط مع التقاط موقع GPS ذكي. كروت ملونة لحالة الطلب (برتقالي = انتظار الحسابات، أخضر = معتمد).
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 rounded-2xl border border-emerald-500/20 bg-slate-900/60 p-5">
                <span className="text-3xl">🔐</span>
                <div>
                  <h3 className="text-lg font-bold text-white">دخول موحد ذكي</h3>
                  <p className="text-sm text-slate-400">
                    شاشة دخول واحدة تتعرف تلقائياً على الدور (سائق/مندوب) وتوجه المستخدم للواجهة المناسبة فوراً.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap gap-2">
              {[
                "Expo Router",
                "NativeWind v4",
                "Background GPS",
                "Socket.io Realtime",
                "JWT Auth",
                "RTL Support",
              ].map((tech) => (
                <span
                  key={tech}
                  className="rounded-full border border-slate-700 bg-slate-800/50 px-3 py-1 text-xs font-medium text-slate-300"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>

          {/* Mock Phone Preview */}
          <div className="flex items-center justify-center">
            <div className="relative w-80 rounded-[3rem] border-8 border-slate-800 bg-slate-900 p-4 shadow-2xl">
              {/* Phone Screen */}
              <div className="h-[600px] overflow-hidden rounded-[2.5rem] bg-gradient-to-b from-orange-500 to-orange-600 p-6">
                {/* Status Bar */}
                <div className="flex items-center justify-between text-white text-xs mb-6">
                  <span>9:41</span>
                  <span>📶 🔋</span>
                </div>

                {/* Driver View Mock */}
                <div className="rounded-3xl bg-white p-5 shadow-lg">
                  <div className="mb-4">
                    <div className="text-xs text-slate-500 mb-1">رقم الرحلة</div>
                    <div className="text-xl font-bold text-slate-800">
                      TRP-2024-0142
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-2xl p-3 mb-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">العميل</span>
                      <span className="font-semibold">شركة البناء</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">الكمية</span>
                      <span className="font-semibold">5.0 م³</span>
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs mb-2">
                      <span className="text-slate-600">تقدم الرحلة</span>
                      <span className="font-semibold">3/7</span>
                    </div>
                    <div className="h-2 bg-slate-200 rounded-full">
                      <div className="h-full bg-blue-500 rounded-full w-[43%]"></div>
                    </div>
                  </div>

                  {/* Action Button */}
                  <button className="w-full bg-emerald-500 text-white font-bold text-lg py-5 rounded-2xl">
                    📍 وصل الموقع
                  </button>
                </div>

                {/* GPS Indicator */}
                <div className="mt-4 flex items-center gap-2 bg-emerald-50 rounded-2xl p-3">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                  <span className="text-emerald-700 text-xs font-semibold">
                    GPS نشط - تتبع الموقع
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-800 py-12">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-3">
              <Image src="/logo.png" alt="Fimto Soft" width={36} height={36} className="rounded-lg opacity-80" />
              <div>
                <div className="font-bold text-white">Fimto Soft</div>
                <div className="text-xs text-slate-500">Concrete Plant ERP — v1.0.0</div>
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-slate-500">
              <a href="/api/health" className="hover:text-orange-400 transition-colors">
                /api/health
              </a>
              <a href="https://concrete.fimtosoft.com" target="_blank" rel="noopener noreferrer" className="hover:text-orange-400 transition-colors">
                Web Platform ↗
              </a>
              <span>Al-Sharqia, Saudi Arabia</span>
            </div>

            <div className="text-xs text-slate-600">
              Built with Next.js + Drizzle ORM + PostgreSQL
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
