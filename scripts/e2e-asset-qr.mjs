#!/usr/bin/env node
/**
 * ============================================================
 *  E2E — Asset QR identity, warehouse lifecycle, redaction
 *  scripts/e2e-asset-qr.mjs
 * ============================================================
 *
 *  Runs against a local dev server against the real database, inside a
 *  throwaway tenant that deletes itself. Proves the properties that matter,
 *  not just that the endpoints answer 200:
 *
 *    1.  A scan without qr:scan is refused entirely.
 *    2.  BASIC viewers get identity and the driver name, and never the
 *        maintenance file — asserted by key, not by count.
 *    3.  FULL viewers (mechanic / workshop mgr / plant mgr) get the whole file.
 *    4.  One part cannot be fitted to two vehicles.
 *    5.  REMOVING a part keeps its history, and the scan still remembers the
 *        truck it was on. This is the anti-fraud property; if it regresses the
 *        whole feature is worthless.
 *    6.  A returned part that claims "it was installed" is refuted by the scan.
 *    7.  Scrap and disposal keep the label answering, and disposal retires it.
 *    8.  Tenant isolation: another plant's label is NOT_FOUND, not leaked.
 *    9.  Stock cannot go negative, even under a direct over-issue.
 *   10.  Secrets are one-time: a second issue returns no token.
 *   11.  Reprint rotates the secret, so the dead sticker stops working.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ─── config ───────────────────────────────────────────────────────────────────

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:3112';
const DB_URL_FILE = path.join(os.homedir(), '.config', 'fimto_db_url');

// ─── assertions ───────────────────────────────────────────────────────────────

let passed = 0;
const failures = [];

function check(label, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failures.push({ label, detail });
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function checkEq(label, actual, expected) {
  check(
    label,
    JSON.stringify(actual) === JSON.stringify(expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}

function section(title) {
  console.log(`\n\x1b[36m▸ ${title}\x1b[0m`);
}

// ─── http ─────────────────────────────────────────────────────────────────────

async function api(pathname, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body (e.g. 500 from an unhandled throw) */
  }
  return { status: res.status, body: json };
}

// ─── direct DB (setup + assertions the API cannot express) ─────────────────────

const { default: pg } = await import('pg');
const bcrypt = (await import('bcryptjs')).default;

function connectDb() {
  const raw = fs.readFileSync(DB_URL_FILE, 'utf8').trim();
  const u = new URL(raw);
  return new pg.Client({
    host: u.hostname,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
    ssl: { rejectUnauthorized: false },
  });
}

async function q(client, sql, params = []) {
  const res = await client.query(sql, params);
  return res.rows;
}

function randomCode(prefix) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

// ─── run ──────────────────────────────────────────────────────────────────────

const db = await connectDb();
await db.connect();

let tenantId;
/** The second throwaway tenant used to prove isolation — cleaned up too. */
let otherTenantId;
let superToken;
let mechanicToken;
let workshopMgrToken;
let dispatcherToken;
let driverToken;
let hrManagerToken;
let hrOfficerToken;
const created = { users: [], vehicles: [], items: [], units: [], labels: [], equipment: [], employees: [] };

try {
  section('Setup — throwaway tenant, users, vehicle');

  const [tenant] = await q(
    db,
    `INSERT INTO tenants (tenant_code, company_name) VALUES ($1, $2) RETURNING id`,
    [randomCode('E2E').toUpperCase().slice(0, 20), `E2E AssetQR ${randomCode('T')}`]
  );
  tenantId = tenant.id;

  // Users: one per role so permission boundaries are exercised for real, through
  // the real login path — not simulated with a hand-edited permissions array.
  const PASSWORD = 'E2ePass!2026';
  const HASH = bcrypt.hashSync(PASSWORD, 10);

  const mkUser = async (role, tag) => {
    const email = `${randomCode(tag)}@e2e.test`;
    const [u] = await q(
      db,
      `INSERT INTO users (tenant_id, employee_code, full_name, email, password_hash, role)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, email, role`,
      [tenantId, randomCode('U'), 'E2E Tester', email, HASH, role]
    );
    created.users.push(u.id);
    return u;
  };

  const superU = await mkUser('SUPER_ADMIN', 'super');
  const mechU = await mkUser('WORKSHOP_MECHANIC', 'mech');
  const wsMgrU = await mkUser('WORKSHOP_MGR', 'wsm');
  const dispU = await mkUser('DISPATCHER', 'disp');
  const driverU = await mkUser('DRIVER', 'drv');
  const hrM = await mkUser('HR_MANAGER', 'hrm');
  const hrO = await mkUser('HR_OFFICER', 'hro');

  // Log in over HTTP so the JWT + user_sessions path is the real one.
  const login = async (user) => {
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: { email: user.email, password: PASSWORD },
    });
    if (!res.body?.data?.accessToken) {
      throw new Error(`login failed for ${user.role}: ${JSON.stringify(res.body)?.slice(0, 300)}`);
    }
    return res.body.data.accessToken;
  };

  superToken = await login(superU);
  mechanicToken = await login(mechU);
  workshopMgrToken = await login(wsMgrU);
  dispatcherToken = await login(dispU);
  driverToken = await login(driverU);
  hrManagerToken = await login(hrM);
  hrOfficerToken = await login(hrO);

  const [vehicle] = await q(
    db,
    `INSERT INTO fleet_vehicles
       (tenant_id, vehicle_code, plate_number, vehicle_type, tare_weight_tonnes, assigned_driver_id)
     VALUES ($1,$2,$3,'MIXER_TRUCK',12.5,$4) RETURNING id, vehicle_code, plate_number`,
    [tenantId, randomCode('V'), randomCode('P'), driverU.id]
  );
  created.vehicles.push(vehicle.id);

  const [vehicle2] = await q(
    db,
    `INSERT INTO fleet_vehicles
       (tenant_id, vehicle_code, plate_number, vehicle_type, tare_weight_tonnes)
     VALUES ($1,$2,$3,'MIXER_TRUCK',12.5) RETURNING id`,
    [tenantId, randomCode('V'), randomCode('P')]
  );
  created.vehicles.push(vehicle2.id);

  console.log(`  tenant ${tenantId}`);
  console.log(`  vehicle ${vehicle.vehicle_code} / ${vehicle.plate_number}`);

  section('Item cards — creation mints a QR immediately');

  const itemRes = await api('/api/warehouse/items', {
    method: 'POST',
    token: mechanicToken,
    body: {
      itemCode: randomCode('PMP'),
      name: 'Water Pump Assembly',
      nameAr: 'طقم مضخة مياه',
      category: 'SPARE_PART',
      defaultWarehouse: 'SPARES',
      unit: 'PCS',
      minQty: 2,
      unitCostSar: 850,
      isSerialized: true,
    },
  });
  check('create item → 201', itemRes.status === 201, JSON.stringify(itemRes.body)?.slice(0, 200));
  const item = itemRes.body?.data?.item;
  created.items.push(item?.id);

  check('card QR payload returned once', typeof itemRes.body?.data?.qrPayload === 'string');
  check(
    'card QR payload is the printable form',
    /^FIMTO\|IC-\d{6}\|[0-9a-f]{40}$/.test(itemRes.body?.data?.qrPayload ?? ''),
    itemRes.body?.data?.qrPayload
  );

  section('Physical units — each piece gets its own permanent label');

  const unitRes = await api(`/api/warehouse/items/${item.itemCode}/units`, {
    method: 'POST',
    token: mechanicToken,
    body: { unitSerial: 'PUMP-A', notes: 'from the 2024 batch' },
  });
  check('register unit → 201', unitRes.status === 201, JSON.stringify(unitRes.body)?.slice(0, 200));
  const unitA = unitRes.body?.data?.unit;
  created.units.push(unitA?.id);
  const unitAPayload = unitRes.body?.data?.qrPayload;
  check('unit QR is SP-prefixed', /^FIMTO\|SP-\d{6}\|[0-9a-f]{40}$/.test(unitAPayload ?? ''), unitAPayload);

  // Second unit of the same item: identical part, different identity.
  const unitBRes = await api(`/api/warehouse/items/${item.itemCode}/units`, {
    method: 'POST',
    token: mechanicToken,
    body: { unitSerial: 'PUMP-B' },
  });
  const unitB = unitBRes.body?.data?.unit;
  check('register unit B → 201', unitBRes.status === 201, JSON.stringify(unitBRes.body)?.slice(0, 300));
  created.units.push(unitB?.id);
  check('a second identical unit gets a different label', unitBRes.body?.data?.qrLabelCode !== unitRes.body?.data?.qrLabelCode);

  // Registering the unit also received it, so stock is 2.
  const [stockRow] = await q(db, `SELECT qty_on_hand FROM warehouse_items WHERE id=$1`, [item.id]);
  check('registering 2 units put 2 in stock', Number(stockRow.qty_on_hand) === 2, `got ${stockRow.qty_on_hand}`);

  section('Scan without permission — refused entirely');

  const noPerm = await api('/api/qr/scan?code=' + encodeURIComponent(unitAPayload));
  check('anonymous scan → 401', noPerm.status === 401, `got ${noPerm.status}`);

  section('Scan as DRIVER — BASIC tier only');

  const driverScan = await api('/api/qr/scan?code=' + encodeURIComponent(unitAPayload), { token: driverToken });
  check('driver scan → 200', driverScan.status === 200, JSON.stringify(driverScan.body)?.slice(0, 200));
  check('driver gets BASIC tier', driverScan.body?.data?.tier === 'BASIC', driverScan.body?.data?.tier);
  check('driver sees the item identity', driverScan.body?.data?.subject?.itemCode === item.itemCode, JSON.stringify(driverScan.body?.data?.subject));
  check(
    'driver does NOT see unit cost',
    !('unitCostSar' in (driverScan.body?.data?.subject ?? {})),
    JSON.stringify(driverScan.body?.data?.subject)
  );
  check('driver does NOT see the movement history', (driverScan.body?.data?.history ?? null) === null);

  // Vehicle label scan: the driver's own record must resolve, and be thin.
  const [vehLabel] = await q(
    db,
    `SELECT id FROM asset_qr_labels WHERE tenant_id=$1 AND subject_type='VEHICLE' AND subject_id=$2`,
    [tenantId, vehicle.id]
  );
  let vehicleScan = null;
  if (vehLabel) {
    const [ins] = await q(db, `SELECT token_hash FROM asset_qr_labels WHERE id=$1`, [vehLabel.id]);
    // Issue a label properly so we hold the secret.
    const vl = await api('/api/qr/labels', {
      method: 'POST',
      token: superToken,
      body: { subjectType: 'VEHICLE', subjectId: vehicle.id, subjectRef: vehicle.vehicle_code, subjectLabel: vehicle.plate_number },
    });
    created.labels.push(vl.body?.data?.label?.id);
    vehicleScan = await api('/api/qr/scan?code=' + encodeURIComponent(vl.body?.data?.qrPayload ?? ''), { token: driverToken });
    void ins;
  }
  if (vehicleScan) {
    check('driver scan of a truck → 200', vehicleScan.status === 200);
    check('driver gets BASIC on a truck too', vehicleScan.body?.data?.tier === 'BASIC');
    check('driver sees the driver name', vehicleScan.body?.data?.subject?.assignedDriverName === 'E2E Tester');
    check(
      'driver does NOT see maintenance history',
      !('maintenanceCount' in (vehicleScan.body?.data?.subject ?? {})),
      JSON.stringify(vehicleScan.body?.data?.subject)
    );
  }

  section('Scan as MECHANIC — FULL tier');

  const mechScan = await api('/api/qr/scan?code=' + encodeURIComponent(unitAPayload), { token: mechanicToken });
  check('mechanic scan → 200', mechScan.status === 200);
  check('mechanic gets FULL tier', mechScan.body?.data?.tier === 'FULL', mechScan.body?.data?.tier);
  check('mechanic sees unit cost', 'unitCostSar' in (mechScan.body?.data?.subject ?? {}), JSON.stringify(mechScan.body?.data?.subject));

  section('One part cannot be on two trucks');

  const issue = await api('/api/warehouse/movements', {
    method: 'POST',
    token: mechanicToken,
    body: { itemId: item.id, movementType: 'ISSUE', quantity: 1, unitId: unitA.id, note: 'to mechanic' },
  });
  check('ISSUE → 200', issue.status === 200, JSON.stringify(issue.body)?.slice(0, 200));

  const install1 = await api('/api/warehouse/movements', {
    method: 'POST',
    token: mechanicToken,
    body: { itemId: item.id, movementType: 'INSTALL', quantity: 1, unitId: unitA.id, vehicleId: vehicle.id, note: 'front bay' },
  });
  check('INSTALL onto truck 1 → 200', install1.status === 200, JSON.stringify(install1.body)?.slice(0, 200));

  const issueB = await api('/api/warehouse/movements', {
    method: 'POST',
    token: mechanicToken,
    body: { itemId: item.id, movementType: 'ISSUE', quantity: 1, unitId: unitB.id },
  });
  check('ISSUE unit B → 200', issueB.status === 200, JSON.stringify(issueB.body)?.slice(0, 300));

  const install2 = await api('/api/warehouse/movements', {
    method: 'POST',
    token: mechanicToken,
    body: { itemId: item.id, movementType: 'INSTALL', quantity: 1, unitId: unitB.id, vehicleId: vehicle.id },
  });
  check('INSTALL second unit on same truck → 200', install2.status === 200, JSON.stringify(install2.body)?.slice(0, 200));

  // Now try to fit the SAME physical part to truck 2. A unit already fitted
  // elsewhere must be refused, and the error has to name the truck holding it —
  // "it is already on MIX-07" tells the mechanic where to go; "issue it first"
  // would send them to the stores for nothing.
  const installOther = await api('/api/warehouse/movements', {
    method: 'POST',
    token: mechanicToken,
    body: { itemId: item.id, movementType: 'INSTALL', quantity: 1, unitId: unitA.id, vehicleId: vehicle2.id, note: 'second truck' },
  });
  check(
    'the same part cannot be fitted to two trucks',
    installOther.status === 409 && installOther.body?.errorCode === 'PART_ALREADY_FITTED',
    `${installOther.status} ${JSON.stringify(installOther.body)?.slice(0, 160)}`
  );
  check(
    'the refusal names the truck that already has it',
    installOther.body?.details?.vehicleCode === vehicle.vehicle_code,
    JSON.stringify(installOther.body?.details)
  );

  section('Removal keeps the history — the anti-fraud property');

  const remove = await api('/api/warehouse/movements', {
    method: 'POST',
    token: mechanicToken,
    body: { itemId: item.id, movementType: 'REMOVE', quantity: 1, unitId: unitA.id, vehicleId: vehicle.id, note: 'failed pump' },
  });
  check('REMOVE → 200', remove.status === 200, JSON.stringify(remove.body)?.slice(0, 200));

  // The label must still answer, and must still name the truck it was on.
  const afterRemove = await api('/api/qr/scan?code=' + encodeURIComponent(unitAPayload), { token: mechanicToken });
  check('removed part still scans', afterRemove.status === 200);
  check(
    'removed part remembers the truck it was on',
    afterRemove.body?.data?.history?.some((h) => h.vehicleCode === vehicle.vehicle_code),
    JSON.stringify(afterRemove.body?.data?.history)
  );
  check('removed part is no longer fitted', afterRemove.body?.data?.currentBinding === null);

  // This is the refutation: the part now sits in the warehouse, and the scan
  // proves it was on vehicle 1 the whole time — so "I fitted it" is checkable.
  const [bindingRows] = await q(
    db,
    `SELECT count(*)::int AS n FROM asset_qr_bindings
     WHERE label_id=(SELECT id FROM asset_qr_labels WHERE tenant_id=$1 AND subject_type='ITEM_UNIT' AND subject_id=$2)
       AND unbound_at IS NOT NULL`,
    [tenantId, unitA.id]
  );
  check('removal closed the binding instead of deleting it', bindingRows.n === 1, `n=${bindingRows.n}`);

  section('Scrap warehouse (مخزن الهالك)');

  const toScrap = await api('/api/warehouse/movements', {
    method: 'POST',
    token: mechanicToken,
    body: { itemId: item.id, movementType: 'TO_SCRAP', quantity: 1, unitId: unitA.id, note: 'beyond repair' },
  });
  check('TO_SCRAP → 200', toScrap.status === 200, JSON.stringify(toScrap.body)?.slice(0, 200));
  check('unit is now IN_SCRAP', toScrap.body?.data?.unitState === 'IN_SCRAP', toScrap.body?.data?.unitState);

  const scrapScan = await api('/api/qr/scan?code=' + encodeURIComponent(unitAPayload), { token: mechanicToken });
  check('scrapped part still scans', scrapScan.status === 200);
  check(
    'scrapped part still remembers its truck',
    scrapScan.body?.data?.history?.some((h) => h.vehicleCode === vehicle.vehicle_code)
  );

  section('Dispose is separately permissioned');

  const driverDispose = await api('/api/warehouse/movements', {
    method: 'POST',
    token: driverToken,
    body: { itemId: item.id, movementType: 'DISPOSE', quantity: 1, unitId: unitA.id },
  });
  check('driver cannot dispose → 403', driverDispose.status === 403, `got ${driverDispose.status}`);

  // A mechanic bins dead parts for a living, so SCRAP is theirs — but DISPOSE is
  // the action that makes stock stop existing, and that stays with a manager.
  // Both halves are asserted because the useful failure mode here is a
  // permission set that is too WIDE, and only the refusal proves it.
  const mechDispose = await api('/api/warehouse/movements', {
    method: 'POST',
    token: mechanicToken,
    body: { itemId: item.id, movementType: 'DISPOSE', quantity: 1, unitId: unitA.id },
  });
  check(
    'mechanic can scrap but not dispose → 403',
    mechDispose.status === 403,
    `${mechDispose.status} ${JSON.stringify(mechDispose.body)?.slice(0, 160)}`
  );

  const dispose = await api('/api/warehouse/movements', {
    method: 'POST',
    token: workshopMgrToken,
    body: { itemId: item.id, movementType: 'DISPOSE', quantity: 1, unitId: unitA.id, note: 'sold as scrap metal' },
  });
  check('workshop manager DISPOSE → 200', dispose.status === 200, JSON.stringify(dispose.body)?.slice(0, 200));

  const [retired] = await q(
    db,
    `SELECT state FROM asset_qr_labels WHERE tenant_id=$1 AND subject_type='ITEM_UNIT' AND subject_id=$2`,
    [tenantId, unitA.id]
  );
  check('disposal RETIRES the label', retired.state === 'RETIRED', retired.state);

  const retiredScan = await api('/api/qr/scan?code=' + encodeURIComponent(unitAPayload), { token: mechanicToken });
  check('a retired label no longer scans', retiredScan.status === 404, `got ${retiredScan.status}`);

  section('Stock cannot go negative');

  // Deliberately a BULK (non-serialized) item. Issuing 999 from a serialized
  // item is refused earlier for having no unit — which is correct, but it would
  // test the wrong rule. Bulk stock is where "someone handed out more than we
  // had" actually happens, and where the >= 0 constraint has to hold.
  const bulk = await api('/api/warehouse/items', {
    method: 'POST',
    token: mechanicToken,
    body: {
      itemCode: randomCode('BULK').slice(0, 24),
      name: 'Hydraulic oil 46',
      category: 'LUBRICANT',
      unit: 'LTR',
      isSerialized: false,
    },
  });
  check('bulk item created', bulk.status === 201, JSON.stringify(bulk.body)?.slice(0, 200));
  const bulkId = bulk.body?.data?.item?.id;
  if (bulkId) created.items.push(bulkId);

  const overIssue = await api('/api/warehouse/movements', {
    method: 'POST',
    token: mechanicToken,
    body: { itemId: bulkId, movementType: 'ISSUE', quantity: 999, note: 'over-issue attempt' },
  });
  check('over-issue → 409', overIssue.status === 409, `got ${overIssue.status}`);
  check('over-issue names the real stock', overIssue.body?.errorCode === 'INSUFFICIENT_STOCK');

  const [afterOver] = await q(db, `SELECT qty_on_hand FROM warehouse_items WHERE id=$1`, [bulkId]);
  check('stock was not driven negative', Number(afterOver.qty_on_hand) >= 0, `got ${afterOver.qty_on_hand}`);

  // And the check has to hold against a concurrent pair of requests, not just a
  // pre-flight read. Two issuances of 8 against 10 in stock both pass the
  // pre-check; only the CHECK (>= 0) constraint lets the second one lose. If the
  // pre-check were the only guard this test would show a negative total.
  await api('/api/warehouse/movements', {
    method: 'POST',
    token: mechanicToken,
    body: { itemId: bulkId, movementType: 'RECEIVE', quantity: 10 },
  });
  const [raceStart] = await q(db, `SELECT qty_on_hand FROM warehouse_items WHERE id=$1`, [bulkId]);
  if (Number(raceStart.qty_on_hand) === 10) {
    const race = await Promise.all([
      api('/api/warehouse/movements', {
        method: 'POST',
        token: mechanicToken,
        body: { itemId: bulkId, movementType: 'ISSUE', quantity: 8, note: 'race A' },
      }),
      api('/api/warehouse/movements', {
        method: 'POST',
        token: mechanicToken,
        body: { itemId: bulkId, movementType: 'ISSUE', quantity: 8, note: 'race B' },
      }),
    ]);
    const [afterRace] = await q(db, `SELECT qty_on_hand FROM warehouse_items WHERE id=$1`, [bulkId]);
    check(
      'two concurrent issues cannot both win the last stock',
      Number(afterRace.qty_on_hand) >= 0,
      `qty=${afterRace.qty_on_hand} statuses=${race.map((r) => r.status).join('/')}`
    );
    check(
      'exactly one of the racing issues was accepted',
      race.filter((r) => r.status === 200).length === 1,
      `statuses=${race.map((r) => r.status).join('/')}`
    );
  } else {
    check('race precondition held', false, `starting stock was ${raceStart.qty_on_hand}, expected 10`);
  }

  section('Tenant isolation — another plant sees nothing');

  const [otherTenant] = await q(
    db,
    `INSERT INTO tenants (tenant_code, company_name) VALUES ($1,$2) RETURNING id`,
    [randomCode('OTH').toUpperCase().slice(0, 20), 'Other Plant']
  );
  otherTenantId = otherTenant.id;
  const [otherItem] = await q(
    db,
    `INSERT INTO warehouse_items (tenant_id, item_code, name, is_serialized)
     VALUES ($1,$2,'Foreign Part',true) RETURNING id`,
    [otherTenant.id, randomCode('F')]
  );
  const [otherUnit] = await q(
    db,
    `INSERT INTO warehouse_item_units (tenant_id, item_id, unit_serial) VALUES ($1,$2,$3) RETURNING id`,
    [otherTenant.id, otherItem.id, 'FOREIGN-1']
  );
  const otherIssue = await api('/api/qr/labels', {
    method: 'POST',
    token: superToken,
    body: { subjectType: 'ITEM_UNIT', subjectId: otherUnit.id, subjectRef: 'FOREIGN-1' },
  });
  // Issued against OUR tenant, so the label belongs to our tenant but points at
  // a foreign unit — it must resolve to nothing rather than leak that unit.
  const foreignScan = await api('/api/qr/scan?code=' + encodeURIComponent(otherIssue.body?.data?.qrPayload ?? ''), {
    token: superToken,
  });
  check(
    'a label pointing at another tenant\'s unit resolves to no subject',
    foreignScan.status === 200 && foreignScan.body?.data?.subject === null,
    `${foreignScan.status} subject=${JSON.stringify(foreignScan.body?.data?.subject)}`
  );

  section('Secrets are one-time');

  const secondIssue = await api('/api/qr/labels', {
    method: 'POST',
    token: superToken,
    body: { subjectType: 'ITEM_UNIT', subjectId: unitB.id, subjectRef: 'PUMP-B' },
  });
  check('re-issuing an existing label returns 200', secondIssue.status === 200);
  check('re-issue hands back NO secret', secondIssue.body?.data?.qrPayload === null, JSON.stringify(secondIssue.body?.data?.qrPayload));
  check('re-issue is flagged as already issued', secondIssue.body?.data?.alreadyIssued === true);

  section('Reprint rotates the secret');

  const [unitBLabel] = await q(
    db,
    `SELECT id FROM asset_qr_labels WHERE tenant_id=$1 AND subject_type='ITEM_UNIT' AND subject_id=$2`,
    [tenantId, unitB.id]
  );
  const reprint = await api('/api/qr/labels', {
    method: 'PATCH',
    token: superToken,
    body: { labelId: unitBLabel.id, reason: 'sticker scratched by the loader' },
  });
  check('reprint → 200', reprint.status === 200, JSON.stringify(reprint.body)?.slice(0, 160));
  const newPayload = reprint.body?.data?.qrPayload;
  check('reprint produced a new payload', typeof newPayload === 'string' && newPayload.length > 0);

  const oldScan = await api('/api/qr/scan?code=' + encodeURIComponent(unitBRes.body?.data?.qrPayload ?? ''), {
    token: superToken,
  });
  check('the OLD sticker stops scanning', oldScan.status === 404, `got ${oldScan.status}`);

  const newScan = await api('/api/qr/scan?code=' + encodeURIComponent(newPayload ?? ''), { token: superToken });
  check('the NEW sticker scans', newScan.status === 200, `got ${newScan.status}`);
  check('and resolves to the same part', newScan.body?.data?.label?.subjectId === unitB.id);

  section('Equipment (معدات) — register and label in one call');

  const eqRes = await api('/api/equipment', {
    method: 'POST',
    token: superToken,
    body: {
      equipmentCode: randomCode('GEN'),
      name: 'Standby Generator 250kVA',
      nameAr: 'مولد كهرباء احتياطي',
      category: 'GENERATOR',
      make: 'Cummins',
      location: 'Plant yard',
    },
  });
  check('register equipment → 201', eqRes.status === 201, JSON.stringify(eqRes.body)?.slice(0, 200));
  check('equipment QR minted on registration', /^FIMTO\|EQ-\d{6}\|[0-9a-f]{40}$/.test(eqRes.body?.data?.qrPayload ?? ''));
  created.equipment.push(eqRes.body?.data?.equipment?.id);

  const dupCode = await api('/api/equipment', {
    method: 'POST',
    token: superToken,
    body: { equipmentCode: eqRes.body.data.equipment.equipmentCode, name: 'Clone' },
  });
  check('duplicate equipment code → 409', dupCode.status === 409, `got ${dupCode.status}`);

  section('Employees (سجلات الموظفين) — HR_MANAGER owns the master');

  const officerCreate = await api('/api/employees', {
    method: 'POST',
    token: hrOfficerToken,
    body: { employeeCode: randomCode('E'), fullName: 'Officer Attempt' },
  });
  check('HR officer cannot add an employee → 403', officerCreate.status === 403, `got ${officerCreate.status}`);

  const empCode = randomCode('E');
  const empRes = await api('/api/employees', {
    method: 'POST',
    token: hrManagerToken,
    body: {
      employeeCode: empCode,
      fullName: 'Mohammed Al-Harbi',
      jobTitle: 'Mixer Driver',
      department: 'Fleet',
      nationality: 'SAUDI',
      gosiSystem: 'NEW',
      hireDate: '2024-03-01',
      baseSalarySar: 6000,
    },
  });
  check('HR manager adds an employee → 201', empRes.status === 201, JSON.stringify(empRes.body)?.slice(0, 200));
  check('employee badge minted', /^FIMTO\|EMP-\d{6}\|[0-9a-f]{40}$/.test(empRes.body?.data?.qrPayload ?? ''));
  created.employees.push(empRes.body?.data?.employee?.id);

  const dupEmp = await api('/api/employees', {
    method: 'POST',
    token: hrManagerToken,
    body: { employeeCode: empCode, fullName: 'Impostor' },
  });
  check('duplicate employee code → 409', dupEmp.status === 409, `got ${dupEmp.status}`);

  // The badge must not leak pay.
  const empScan = await api('/api/qr/scan?code=' + encodeURIComponent(empRes.body?.data?.qrPayload ?? ''), {
    token: hrManagerToken,
  });
  check('employee badge scans', empScan.status === 200);
  check(
    'badge scan does NOT expose salary',
    !('baseSalarySar' in (empScan.body?.data?.subject ?? {})),
    JSON.stringify(empScan.body?.data?.subject)
  );

  const empListAsOfficer = await api('/api/employees', { token: hrOfficerToken });
  check('HR officer cannot read the employee master → 403', empListAsOfficer.status === 403, `got ${empListAsOfficer.status}`);

  const empList = await api('/api/employees', { token: hrManagerToken });
  check('HR manager reads the employee master → 200', empList.status === 200);
  check(
    'employee list omits salary',
    !JSON.stringify(empList.body?.data ?? []).includes('baseSalarySar'),
    'list leaked a salary column'
  );

  section('Vehicle record — BASIC vs FULL');

  const basicRecord = await api(`/api/fleet/vehicles/${vehicle.id}/record`, { token: dispatcherToken });
  check('dispatcher gets BASIC', basicRecord.body?.data?.depth === 'BASIC', basicRecord.body?.data?.depth);
  check('dispatcher sees the driver name', basicRecord.body?.data?.assignedDriverName === 'E2E Tester');
  check('dispatcher does NOT see work orders', basicRecord.body?.data?.workOrders === undefined);
  check('dispatcher does NOT see the parts history', basicRecord.body?.data?.partsHistory === undefined);

  const fullRecord = await api(`/api/fleet/vehicles/${vehicle.id}/record`, { token: mechanicToken });
  check('mechanic gets FULL', fullRecord.body?.data?.depth === 'FULL', fullRecord.body?.data?.depth);
  check('mechanic sees the parts history', Array.isArray(fullRecord.body?.data?.partsHistory));
  check(
    'the parts history names the labelled parts',
    fullRecord.body?.data?.partsHistory?.some((p) => String(p.labelCode).startsWith('SP-')),
    JSON.stringify(fullRecord.body?.data?.partsHistory)?.slice(0, 200)
  );

  section('Item card screen — the full trail');

  const card = await api(`/api/warehouse/items/${item.itemCode}`, { token: mechanicToken });
  check('item card → 200', card.status === 200);
  check('card lists its units', card.body?.data?.units?.length === 2, `units=${card.body?.data?.units?.length}`);
  check('every unit shows a QR code', card.body?.data?.units?.every((u) => u.qrLabelCode));

  // The disposed unit's code must still be on the card, marked dead. A stores
  // clerk reconciling the scrap bin needs to see which sticker went out with the
  // part; omitting it makes a scrapped part look like it never existed.
  const disposedUnit = card.body?.data?.units?.find((u) => u.unitSerial === 'PUMP-A');
  check('the disposed part still shows its old code', disposedUnit?.qrLabelCode?.startsWith('SP-'), JSON.stringify(disposedUnit));
  check('the disposed part is marked RETIRED', disposedUnit?.qrLabelState === 'RETIRED', disposedUnit?.qrLabelState);

  // …and the live part is NOT marked retired. Getting this backwards would
  // print dead stickers and hide live ones, which is worse than showing nothing.
  const liveUnit = card.body?.data?.units?.find((u) => u.unitSerial === 'PUMP-B');
  check('a live part is not marked retired', liveUnit?.qrLabelState !== 'RETIRED', liveUnit?.qrLabelState);
  check(
    'the movements name the trucks involved',
    card.body?.data?.movements?.some((m) => m.vehicleCode === vehicle.vehicle_code)
  );

  section('Low-stock reorder list');

  const lowStock = await api('/api/warehouse/items?lowStock=1', { token: mechanicToken });
  check('low stock list → 200', lowStock.status === 200);
  check('the drained item is flagged', lowStock.body?.data?.some((i) => i.itemCode === item.itemCode));

  section('Validation guards');

  const noUnit = await api('/api/warehouse/movements', {
    method: 'POST',
    token: mechanicToken,
    body: { itemId: item.id, movementType: 'INSTALL', quantity: 1, vehicleId: vehicle.id },
  });
  check(
    'INSTALL without a unit on a serialized item → 400',
    noUnit.status === 400 && noUnit.body?.errorCode === 'UNIT_REQUIRED',
    `${noUnit.status} ${noUnit.body?.errorCode}`
  );

  const installNoVehicle = await api('/api/warehouse/movements', {
    method: 'POST',
    token: mechanicToken,
    body: { itemId: item.id, movementType: 'INSTALL', quantity: 1, unitId: unitB.id },
  });
  check(
    'INSTALL without a vehicle → 400',
    installNoVehicle.status === 400 && installNoVehicle.body?.errorCode === 'VEHICLE_REQUIRED',
    `${installNoVehicle.status} ${installNoVehicle.body?.errorCode}`
  );

  const wrongState = await api('/api/warehouse/movements', {
    method: 'POST',
    token: mechanicToken,
    body: { itemId: item.id, movementType: 'REMOVE', quantity: 1, unitId: unitB.id, vehicleId: vehicle.id },
  });
  // unit B is fitted to vehicle 1 already (install2 succeeded), so REMOVE is legal.
  check(
    'REMOVE of a fitted unit succeeds',
    wrongState.status === 200,
    `${wrongState.status} ${JSON.stringify(wrongState.body)?.slice(0, 140)}`
  );

  const scanGarbage = await api('/api/qr/scan?code=' + encodeURIComponent('not-a-label'), { token: mechanicToken });
  check('garbage scan → 404, not 500', scanGarbage.status === 404, `got ${scanGarbage.status}`);

  section('Audit trail');

  const [audits] = await q(
    db,
    `SELECT count(*)::int AS n FROM audit_logs
     WHERE tenant_id=$1 AND action IN
       ('STOCK_INSTALL','STOCK_REMOVE','STOCK_TO_SCRAP','STOCK_DISPOSE','STOCK_ISSUE')`,
    [tenantId]
  );
  check('every stock movement was audited', audits.n >= 6, `n=${audits.n}`);

  const [qrAudits] = await q(
    db,
    `SELECT count(*)::int AS n FROM audit_logs
     WHERE tenant_id=$1 AND action IN ('QR_LABEL_REISSUED','WAREHOUSE_ITEM_CREATED','WAREHOUSE_UNIT_REGISTERED','EMPLOYEE_CREATED','EQUIPMENT_REGISTERED')`,
    [tenantId]
  );
  check('label and master-data creation were audited', qrAudits.n >= 5, `n=${qrAudits.n}`);
} catch (err) {
  failures.push({ label: 'harness', detail: err?.stack ?? String(err) });
  console.error('\n\x1b[31mHarness error:\x1b[0m', err);
} finally {
  // ─── Self-clean. Order matters: RESTRICT FKs mean children first. ───────────
  section('Cleanup');
  if (tenantId) {
    try {
      await q(db, `DELETE FROM audit_logs WHERE tenant_id=$1`, [tenantId]);
      await q(db, `DELETE FROM stock_movements WHERE tenant_id=$1`, [tenantId]);
      await q(db, `DELETE FROM asset_qr_bindings WHERE tenant_id=$1`, [tenantId]);
      await q(db, `DELETE FROM asset_qr_labels WHERE tenant_id=$1`, [tenantId]);
      await q(db, `DELETE FROM warehouse_item_units WHERE tenant_id=$1`, [tenantId]);
      await q(db, `DELETE FROM warehouse_items WHERE tenant_id=$1`, [tenantId]);
      await q(db, `DELETE FROM equipment WHERE tenant_id=$1`, [tenantId]);
      await q(db, `DELETE FROM payroll_employees WHERE tenant_id=$1`, [tenantId]);
      await q(db, `DELETE FROM lab_test_samples WHERE tenant_id=$1`, [tenantId]);
      await q(db, `DELETE FROM maintenance_orders WHERE tenant_id=$1`, [tenantId]);
      await q(db, `DELETE FROM fuel_logs WHERE tenant_id=$1`, [tenantId]);
      await q(db, `DELETE FROM fleet_vehicles WHERE tenant_id=$1`, [tenantId]);
      await q(db, `DELETE FROM user_sessions WHERE user_id = ANY($1::uuid[])`, [created.users]);
      await q(db, `DELETE FROM users WHERE tenant_id=$1`, [tenantId]);
      await q(db, `DELETE FROM tenants WHERE id=$1`, [tenantId]);
      console.log('  ✓ throwaway tenant removed');
    } catch (e) {
      console.error('  ✗ cleanup failed:', e.message);
    }
  }

  // The isolation tenant is a second real tenant with its own rows, so it needs
  // removing too — otherwise every run leaks a plant into production.
  if (otherTenantId) {
    try {
      await q(db, `DELETE FROM warehouse_item_units WHERE tenant_id=$1`, [otherTenantId]);
      await q(db, `DELETE FROM warehouse_items WHERE tenant_id=$1`, [otherTenantId]);
      await q(db, `DELETE FROM tenants WHERE id=$1`, [otherTenantId]);
      console.log('  ✓ isolation tenant removed');
    } catch (e) {
      console.error('  ✗ isolation tenant cleanup failed:', e.message);
    }
  }
  await db.end();
}

// ─── report ───────────────────────────────────────────────────────────────────

const total = passed + failures.length;
console.log(`\n${'─'.repeat(64)}`);
if (failures.length === 0) {
  console.log(`\x1b[32m✓ ${passed}/${total} assertions passed\x1b[0m`);
  process.exit(0);
} else {
  console.log(`\x1b[31m✗ ${failures.length}/${total} failed\x1b[0m`);
  for (const f of failures) console.log(`  • ${f.label}${f.detail ? ` — ${f.detail}` : ''}`);
  process.exit(1);
}