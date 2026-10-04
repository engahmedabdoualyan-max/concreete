/**
 * Mint the permanent QR label for every imported GPS vehicle.
 *
 * Deliberately calls `issueLabel` rather than inserting rows directly, so the
 * labels are byte-for-byte what the app would have produced: same label-code
 * sequence, same SHA-256 token hashing, same `issued_by`, same state. Hand-
 * rolling the insert would drift from the service the first time anyone changed
 * the payload format, and every sticker already printed would be dead.
 *
 * `issueLabel` is idempotent (it returns the existing live label rather than
 * minting a second one), so this script is safe to re-run.
 *
 * Run:  npx tsx scripts/mint-gps-labels.ts
 */
import { writeFileSync } from 'node:fs';
import { eq, and, isNotNull } from 'drizzle-orm';
import { db } from '@/db';
import { tenants, fleetVehicles, users, type AssetQrSubjectType } from '@/db/schema';
import { issueLabel } from '@/lib/services/asset-qr.service';

const TENANT_CODE = 'ALMOTWER';
const SUBJECT: AssetQrSubjectType = 'VEHICLE';

async function main() {
  const [tenant] = await db
    .select({ id: tenants.id, company: tenants.companyName })
    .from(tenants)
    .where(eq(tenants.tenantCode, TENANT_CODE))
    .limit(1);
  if (!tenant) throw new Error(`tenant ${TENANT_CODE} not found`);
  console.log(`tenant ${tenant.company} (${tenant.id})`);

  // Attribute the labels to the plant manager so the audit trail names a person,
  // not "the import script".
  const [issuer] = await db
    .select({ id: users.id, name: users.fullName, role: users.role })
    .from(users)
    .where(and(eq(users.tenantId, tenant.id), eq(users.role, 'PLANT_MGR')))
    .limit(1);
  console.log(`issued by: ${issuer?.name ?? '(none — will be null)'} [${issuer?.role ?? '-'}]`);

  const vehicles = await db
    .select({
      id: fleetVehicles.id,
      code: fleetVehicles.vehicleCode,
      plate: fleetVehicles.plateNumber,
      type: fleetVehicles.vehicleType,
    })
    .from(fleetVehicles)
    .where(eq(fleetVehicles.tenantId, tenant.id))
    .orderBy(fleetVehicles.vehicleCode);
  console.log(`vehicles: ${vehicles.length}`);

  const rows = [];
  let minted = 0;
  let reused = 0;

  for (const v of vehicles) {
    const res = await issueLabel({
      tenantId: tenant.id,
      subjectType: SUBJECT,
      subjectId: v.id,
      subjectRef: v.code,
      subjectLabel: v.plate,
      issuedById: issuer?.id ?? null,
    });
    if (!res.ok) throw new Error(`issueLabel failed for ${v.code}`);

    // token is null when a live label already existed — the secret is
    // unrecoverable by design, so a re-run can report the code but not reprint
    // a working sticker. That is correct behaviour, not a failure.
    const isNew = res.token !== null;
    if (isNew) minted++;
    else reused++;

    rows.push({
      vehicleCode: v.code,
      plate: v.plate,
      vehicleType: v.type,
      labelCode: res.label.labelCode,
      payload: isNew ? `FIMTO|${res.label.labelCode}|${res.token}` : '(already issued — secret not recoverable)',
      newLabel: isNew,
    });
  }

  const csv = [
    'vehicle_code,plate,vehicle_type,label_code,payload',
    ...rows.map((r) =>
      [r.vehicleCode, `"${r.plate}"`, r.vehicleType, r.labelCode, `"${r.payload}"`].join(',')
    ),
  ].join('\n');
  writeFileSync('/tmp/opencode/gps-labels.csv', csv);

  console.log(`\nminted ${minted}, reused ${reused}`);
  for (const r of rows) {
    console.log(
      `  ${r.labelCode}  ${r.vehicleCode.padEnd(6)} ${r.plate.padEnd(14)} ${r.vehicleType.padEnd(14)} ${r.newLabel ? '✓ new' : '· existed'}`
    );
  }
  console.log('\nwrote /tmp/opencode/gps-labels.csv');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });