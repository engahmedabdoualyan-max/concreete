#!/usr/bin/env node
/**
 * Prove the visibility tiers differ by ROLE, not just in theory.
 *
 * Logs in over HTTP as one account per tier and reports what each one can
 * actually reach. This is the check behind "whoever sees what" — a permission
 * that exists in the RBAC map but is not enforced on the route would still pass
 * every unit test and still leak on the screen.
 *
 * Usage:  node scripts/.check-role-tiers.mjs [apiBase]
 */
const BASE = process.argv[2] ?? 'http://127.0.0.1:3111';
const PASSWORD = 'Almotwer2026!';

const ACCOUNTS = [
  ['ptown@almotwer.com', 'PLANT_MGR', 'FULL'],
  ['workshopMgr@almotwer.com', 'WORKSHOP_MGR', 'FULL'],
  ['mechanicFull@almotwer.com', 'WORKSHOP_MECHANIC', 'FULL'],
  ['hrManager@almotwer.com', 'HR_MANAGER', 'FULL'],
  ['driver@almotwer.com', 'DRIVER', 'BASIC'],
  ['dispatcher@almotwer.com', 'DISPATCHER', 'BASIC'],
];

async function login(email) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const j = await r.json().catch(() => ({}));
  const token = j?.data?.accessToken ?? j?.accessToken;
  if (!token) throw new Error(`login failed for ${email}: ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return token;
}

async function call(token, path) {
  const r = await fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${token}` } });
  return { status: r.status, body: await r.json().catch(() => null) };
}

const { readFileSync } = await import('node:fs');
const row = readFileSync('/tmp/opencode/gps-labels.csv', 'utf8').trim().split('\n')[1];
const m = row.match(/^([^,]+),"([^"]+)",([^,]+),([^,]+),"([^"]+)"$/);
if (!m) throw new Error(`could not parse CSV row: ${row}`);
const [, vehicleCode, plate, , labelCode, payload] = m;
console.log(`label ${labelCode} — vehicle ${vehicleCode}, plate ${plate}`);

let failures = 0;
console.log(`scanning the same label for every role — ${payload}\n`);

for (const [email, role, expectedTier] of ACCOUNTS) {
  const token = await login(email);

  // Vehicles the role can list at all. The route wraps them in {data:{vehicles}}.
  const fleet = await call(token, '/api/fleet');
  const vehicleCount = fleet.body?.data?.vehicles?.length ?? 'n/a';

  // The scan itself, at the tier this role resolves to.
  const scan = await call(token, `/api/qr/scan?code=${encodeURIComponent(payload)}`);
  const s = scan.body?.data ?? scan.body;
  const subject = s?.subject;
  const sawTare = subject && 'tareWeightTonnes' in subject;
  const sawSpend = subject && 'repairSpendSar' in subject;
  const actualTier = sawSpend || sawTare ? 'FULL' : subject ? 'BASIC' : 'blocked';

  const ok = scan.status === 200 && actualTier === expectedTier && vehicleCount !== 0;
  if (!ok) failures++;

  console.log(
    `  ${ok ? '✓' : '✗'} ${role.padEnd(18)} scan=${scan.status} tier=${actualTier.padEnd(7)} (want ${expectedTier})  vehicles=${vehicleCount}  ${ok ? '' : JSON.stringify(scan.body).slice(0, 160)}`
  );
  if (subject) {
    console.log(`      sees: ${Object.keys(subject).join(', ')}`);
  }
}

console.log(failures === 0 ? '\nEVERY ROLE SEES EXACTLY ITS TIER' : `\n${failures} ROLE(S) WRONG`);
process.exit(failures === 0 ? 0 : 1);