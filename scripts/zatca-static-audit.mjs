#!/usr/bin/env node
/** Static guard for the Fimto ZATCA reliability/security baseline. */
import { readFileSync } from 'node:fs';

const service = readFileSync('src/lib/services/zatca.service.ts', 'utf8');
const schema = readFileSync('src/db/schema.ts', 'utf8');
const migration = readFileSync('drizzle/0015_zatca_counter_guard.sql', 'utf8');
const checks = [
  [service.includes('sha256Base64'), 'invoice hash uses base64 format'],
  [service.includes('validateZatcaInvoiceInput'), 'invoice validation is wired'],
  [service.includes('AbortSignal.timeout'), 'Fatoora timeout is bounded'],
  [service.includes('pg_advisory_xact_lock'), 'counter allocation is serialized'],
  [service.includes('submittedXml'), 'exact submitted XML is retained'],
  [service.includes('returnedQr'), 'Fatoora-returned QR is preferred'],
  [service.includes('ZATCA_CONFIG_UPDATED'), 'config changes are audited'],
  [service.includes('clients.tenantId') && service.includes('deliverySites.tenantId'), 'order joins are tenant-scoped'],
  [schema.includes('zatca_documents_tenant_counter_unique'), 'schema declares tenant/counter uniqueness'],
  [migration.includes('CREATE UNIQUE INDEX'), 'migration creates tenant/counter uniqueness'],
];
const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}
console.log(`ZATCA static audit passed (${checks.length} checks).`);
