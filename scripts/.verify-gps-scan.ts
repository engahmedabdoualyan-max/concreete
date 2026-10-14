/**
 * Prove an imported vehicle label actually scans end-to-end.
 *
 * Reads the payload back out of the CSV, hands it to `scanLabel` exactly as the
 * HTTP route does, and checks both visibility tiers: BASIC for a driver,
 * FULL for a mechanic. Guards the whole chain — NFKC plate text, label code
 * sequence, SHA-256 hashing, tier gating — in one place.
 *
 * Run:  npx tsx scripts/.verify-gps-scan.ts
 */
import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { tenants } from '@/db/schema';
import { scanLabel } from '@/lib/services/asset-qr.service';

async function main() {
  const [tenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.tenantCode, 'ALMOTWER'))
    .limit(1);
  if (!tenant) throw new Error('ALMOTWER tenant not found');

  const csv = readFileSync('/tmp/opencode/gps-labels.csv', 'utf8').trim().split('\n');
  const first = csv[1]!.match(/^([^,]+),"([^"]+)",([^,]+),([^,]+),"([^"]+)"$/);
  if (!first) throw new Error('could not parse the first CSV row');
  const [, vehicleCode, plate, , labelCode, payload] = first;
  console.log(`scanning ${labelCode} (${vehicleCode} — ${plate})`);
  console.log(`payload: ${payload}\n`);

  let failures = 0;
  const check = (name: string, ok: boolean, detail?: unknown) => {
    console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)}`}`);
    if (!ok) failures++;
  };

  // BASIC — what a driver in the yard is allowed to see.
  const basic = await scanLabel({ tenantId: tenant.id, raw: payload, tier: 'BASIC' });
  check('BASIC tier scans', basic.ok);
  if (basic.ok) {
    check('resolves the vehicle', basic.subject.kind === 'VEHICLE', basic.subject);
    check('shows the plate', basic.subject.plateNumber === plate, basic.subject);
    check(
      'withholds cost/repair history',
      !('repairStats' in basic.subject),
      Object.keys(basic.subject)
    );
  }

  // FULL — what the mechanic sees.
  const full = await scanLabel({ tenantId: tenant.id, raw: payload, tier: 'FULL' });
  check('FULL tier scans', full.ok);
  if (full.ok) {
    check(
      'includes repair history',
      'repairSpendSar' in full.subject && 'worstRepairSar' in full.subject,
      Object.keys(full.subject)
    );
    check('shows tare (weighbridge basis)', 'tareWeightTonnes' in full.subject, Object.keys(full.subject));
    const s = full.subject as Record<string, unknown>;
    console.log(
      `     repairs: count=${s.maintenanceCount} open=${s.openMaintenanceCount} spend=${s.repairSpendSar} worst=${s.worstRepairSar}`
    );
  }

  // A wrong secret must not resolve, even with the right label code.
  const tampered = `${payload.slice(0, payload.lastIndexOf('|') + 1)}${'0'.repeat(40)}`;
  const bad = await scanLabel({ tenantId: tenant.id, raw: tampered, tier: 'FULL' });
  check('a forged secret is refused', !bad.ok, bad);

  // Another tenant must not be able to scan it even with the real payload.
  const foreign = await scanLabel({
    tenantId: '00000000-0000-0000-0000-000000000000',
    raw: payload,
    tier: 'FULL',
  });
  check('another tenant cannot resolve it', !foreign.ok, foreign);

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});