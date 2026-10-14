#!/usr/bin/env node
/**
 * Generate the SQL that loads the GPS fleet into the ALMOTWER tenant.
 *
 * ── Why this is not a one-liner ──────────────────────────────────────────────
 *
 * 1. PLATE LETTERS vs NAMES. The GPS export stores the plate as
 *    "<digits> - <arabic words>", but those words are three different things
 *    mixed together:
 *
 *        "2194 - ه ص ا" + "خلاطه كبير"   ← plate letters  + type + driver name
 *        "5309 - تحسين"                  ←                  name only
 *        "5003 - بمب اصغر"                ←                  type + name
 *
 *    Nothing in the file distinguishes them, and guessing from word length
 *    fails (نور is 3 letters and is a name; ا ص ه is 3 letters and is a plate).
 *    The one reliable signal is REPETITION: a fleet plate series repeats across
 *    many vehicles, whereas names do not. So plate letters are taken to be the
 *    tokens that recur across rows of the same account, after subtracting the
 *    known vehicle-type words (خلاطه/بمب/قلاب). That isolates ه ص ا on 5 rows
 *    and leaves every name behind.
 *
 * 2. TARE WEIGHT. `fleet_vehicles.tare_weight_tonnes` is NOT NULL with no
 *    default, and it is the basis of net = gross − tare at the weighbridge. The
 *    GPS export does not carry it. The constants below are PLACEHOLDERS — real
 *    weights have to come from the weighbridge slips. They are deliberately
 *    written to one decimal place and grouped by type so a single UPDATE fixes
 *    them all. Flagged in the output, not silently accepted.
 *
 * 3. ONE VEHICLE, TWO ACCOUNTS. IMEI 357544372160123 (plate 6515) is listed in
 *    both exports with the same plate. `telematics_devices.serial_number` is
 *    globally UNIQUE, so importing both rows would hard-fail. Deduped to one,
 *    keeping the valid row.
 *
 * Usage:  node .gen-gps-import.mjs        → writes /tmp/opencode/gps-import.sql
 *         node .gen-gps-import.mjs --apply
 */
import { readFileSync, writeFileSync } from 'node:fs';

const TENANT_CODE = 'ALMOTWER';

// ── Placeholder tare weights (tonnes, empty vehicle). REPLACE WITH REAL SLIPS. ──
const TARE_BY_TYPE = {
  MIXER_TRUCK: 12.5,
  CONCRETE_PUMP: 10.5,
  TIPPER_TRUCK: 9.0,
};

const TYPE_KEYWORDS = [
  { re: /خلاط/, type: 'MIXER_TRUCK', cls: 'MIXER' },
  { re: /قلاب/, type: 'TIPPER_TRUCK', cls: 'TIPPER' },
  { re: /بمب/, type: 'CONCRETE_PUMP', cls: 'PUMP' },
];

const data = JSON.parse(readFileSync('/tmp/opencode/gps-fleet.json', 'utf8'));

const esc = (s) => (s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`);

// ── 1. Keep only the valid rows, deduped by IMEI ─────────────────────────────
const byImei = new Map();
let droppedExpired = 0;
let droppedDupe = 0;
for (const r of data.rows) {
  if (!r.valid) {
    droppedExpired++;
    continue;
  }
  if (byImei.has(r.imei)) {
    droppedDupe++;
    continue;
  }
  byImei.set(r.imei, r);
}
const rows = [...byImei.values()];

// ── 2. Find the plate series = tokens recurring on the SAME CONSECUTIVE rows ──
//
// Repetition alone is not enough, and the first version of this proved it: the
// name fragment "ونش" (out of "شان محمد ونش") occurs on two vehicles, so a naive
// "appears more than once" rule promoted it to a plate letter and produced a
// plate reading "6515 شنو". The real series is ا ص ه, which appears on rows
// 1-5 — the same rows, side by side.
//
// So a plate letter must appear on ≥3 rows AND those rows must be contiguous.
// That is what separates a fleet-wide plate series from a name two drivers
// happen to share.
const tokenRows = new Map();
for (const r of rows) {
  for (const tok of new Set((r.descWords.match(/[ء-ي]+/g) ?? []))) {
    if (TYPE_KEYWORDS.some((k) => k.re.test(tok))) continue;
    if (!tokenRows.has(tok)) tokenRows.set(tok, []);
    tokenRows.get(tok).push(r.n);
  }
}

const contiguous = (ns) => ns.every((v, i) => i === 0 || v === ns[i - 1] + 1);
const PLATE_LETTERS = [...tokenRows.entries()]
  .filter(([, ns]) => ns.length >= 3 && contiguous(ns))
  .map(([t]) => t);

// Every detected letter must appear on exactly the same rows. If two tokens both
// pass but disagree about their rows, one of them is a name and this heuristic
// has been fooled — better to stop than to write "6515 شنو" into the plate
// column of production.
if (PLATE_LETTERS.length) {
  const sigs = new Set(PLATE_LETTERS.map((t) => tokenRows.get(t).join(',')));
  if (sigs.size > 1) {
    console.error('\nABORT — plate-letter candidates do not share the same rows:');
    for (const t of PLATE_LETTERS) console.error(`  ${t} → rows ${tokenRows.get(t).join(',')}`);
    process.exit(1);
  }
}
const seriesRows = PLATE_LETTERS.length ? tokenRows.get(PLATE_LETTERS[0]) : [];
console.log(`plate series → ${PLATE_LETTERS.join(' ') || '(none)'}`);
if (seriesRows.length) console.log(`  on rows ${seriesRows.join(',')}`);
const rejected = [...tokenRows.entries()].filter(
  ([t, ns]) => ns.length >= 2 && !PLATE_LETTERS.includes(t)
);
console.log(
  `rejected as names despite recurring: ${rejected.map(([t, ns]) => `${t}(${ns.length}× rows ${ns.join(',')})`).join(', ') || 'none'}`
);

function classify(descWords) {
  const hit = TYPE_KEYWORDS.find((k) => k.re.test(descWords));
  return hit ? { type: hit.type, cls: hit.cls } : { type: 'MIXER_TRUCK', cls: 'MIXER' };
}

// Arabic plate letters are stored logically (ا ص ه) so they read correctly in
// the app; the PDF handed them to us reversed.
const AR_REV = { ا: 'ا', ص: 'ص', ه: 'ه', ب: 'ب', ج: 'ج', د: 'د', ر: 'ر', س: 'س', ط: 'ط', ع: 'ع', ف: 'ف', ق: 'ق', ك: 'ك', ل: 'ل', م: 'م', ن: 'ن', و: 'و', ي: 'ي' };
const toLogical = (tok) =>
  [...tok].reverse().map((c) => AR_REV[c] ?? c).join('');

const built = rows.map((r) => {
  const tokens = r.descWords.match(/[ء-ي]+/g) ?? [];
  const letters = tokens.filter((t) => PLATE_LETTERS.includes(t)).map(toLogical);
  const typeKeywords = tokens.filter((t) => TYPE_KEYWORDS.some((k) => k.re.test(t)));
  const names = tokens.filter(
    (t) => !PLATE_LETTERS.includes(t) && !typeKeywords.includes(t)
  );
  const { type, cls } = classify(r.descWords);

  // Owner chose: digits + plate letters for plate_number, the rest as notes.
  const plate = [r.regDigits, ...letters].join(' ').trim();
  const notesParts = [...names, ...typeKeywords.map((t) => `${t} (${type})`), `GPS source: ${r.account}`];

  return {
    ...r,
    plate,
    notes: notesParts.join(' — '),
    vehicleType: type,
    vehicleClass: cls,
    tare: TARE_BY_TYPE[type],
    unknownType: !TYPE_KEYWORDS.some((k) => k.re.test(r.descWords)),
  };
});

// ── 3. Sanity checks before emitting anything ────────────────────────────────
const problems = [];
const seenPlate = new Map();
const seenCode = new Map();
for (const b of built) {
  if (b.plate.length > 30) problems.push(`plate too long (>30): ${b.plate}`);
  if (seenPlate.has(b.plate)) problems.push(`duplicate plate: ${b.plate} (${seenPlate.get(b.plate)} vs ${b.imei})`);
  seenPlate.set(b.plate, b.imei);
  if (seenCode.has(b.regDigits)) problems.push(`duplicate vehicle_code: ${b.regDigits}`);
  seenCode.set(b.regDigits, b.imei);
}
if (problems.length) {
  console.error('\nABORT — the import would violate a unique index:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}

// ── 4. Emit ──────────────────────────────────────────────────────────────────
const n = built.length;
const typeCounts = new Map();
for (const b of built) typeCounts.set(b.vehicleType, (typeCounts.get(b.vehicleType) ?? 0) + 1);

const sql = `-- GPS fleet import → tenant ${TENANT_CODE}
-- Generated by scripts/.gen-gps-import.mjs
-- ${n} vehicles, ${n} GPS_TRACKER devices. Valid rows only, deduped by IMEI.
-- Dropped: ${droppedExpired} expired SIM rows, ${droppedDupe} cross-account duplicate.
--
-- !! tare_weight_tonnes below is a PLACEHOLDER. It drives net = gross - tare at
-- !! the weighbridge. Replace with the real slip weights before any real weighing:
-- !!   UPDATE fleet_vehicles SET tare_weight_tonnes = <real> WHERE tenant_id = ... ;
BEGIN;

DO $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT id INTO v_tenant FROM tenants WHERE tenant_code = '${TENANT_CODE}';
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant % not found', '${TENANT_CODE}';
  END IF;
  RAISE NOTICE 'importing into tenant % (%)', v_tenant, '${TENANT_CODE}';
END $$;

-- ── Vehicles ────────────────────────────────────────────────────────────────
INSERT INTO fleet_vehicles
  (tenant_id, vehicle_code, plate_number, vehicle_type, vehicle_class,
   tare_weight_tonnes, current_status, is_active, notes)
VALUES
${built
  .map(
    (b, i) => `  ((SELECT id FROM tenants WHERE tenant_code='${TENANT_CODE}'),
     '${b.regDigits}', ${esc(b.plate)}, '${b.vehicleType}', '${b.vehicleClass}',
     ${b.tare}, 'AVAILABLE', true, ${esc(b.notes)})`
  )
  .join(',\n')};

-- ── GPS tracker devices ─────────────────────────────────────────────────────
-- device_type GPS_TRACKER; serial_number is the IMEI (globally unique).
-- is_primary true: one tracker per vehicle, and this is the vehicle's tracker.
INSERT INTO telematics_devices
  (tenant_id, vehicle_id, device_type, serial_number, device_code,
   is_primary, is_active, linked_at)
SELECT
  t.id, v.id, 'GPS_TRACKER', d.ser, d.code, true, true, now()
FROM (VALUES
${built.map((b, i) => `  ('${b.imei}', 'GPS-${String(i + 1).padStart(3, '0')}', '${b.regDigits}')`).join(',\n')}
) AS d(ser, code, vcode)
JOIN tenants t   ON t.tenant_code = '${TENANT_CODE}'
JOIN fleet_vehicles v ON v.tenant_id = t.id AND v.vehicle_code = d.vcode;

COMMIT;

-- ── Verification ────────────────────────────────────────────────────────────
SELECT 'vehicles' AS what, count(*) FROM fleet_vehicles v
  JOIN tenants t ON t.id=v.tenant_id WHERE t.tenant_code='${TENANT_CODE}'
UNION ALL
SELECT 'devices', count(*) FROM telematics_devices d
  JOIN tenants t ON t.id=d.tenant_id WHERE t.tenant_code='${TENANT_CODE}';
`;

writeFileSync('/tmp/opencode/gps-import.sql', sql);

console.log(`
─── PLAN ───
${n} vehicles + ${n} GPS devices → ${TENANT_CODE}
  by type: ${[...typeCounts.entries()].map(([t, c]) => `${t}=${c}`).join(', ')}
  assumed MIXER_TRUCK (no type keyword): ${built.filter((b) => b.unknownType).length}
  dropped expired=${droppedExpired}  dropped duplicate=${droppedDupe}
  plates carrying letters: ${built.filter((b) => b.plate.includes(' ')).length}

  !! tare weights are placeholders: ${[...typeCounts.keys()].map((t) => `${t}=${TARE_BY_TYPE[t]}`).join(', ')}

─── PREVIEW ───
${built
  .map((b, i) => `  ${String(i + 1).padStart(2)}  ${b.plate.padEnd(18)} ${b.vehicleType.padEnd(15)} tare=${b.tare}  ${b.imei}  ${b.notes.slice(0, 42)}`)
  .join('\n')}
`);

if (process.argv.includes('--apply')) {
  console.log('wrote /tmp/opencode/gps-import.sql (not executed — run q.sh to apply)');
}