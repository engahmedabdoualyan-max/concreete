#!/usr/bin/env node
/** Static guard for the Fimto ZATCA reliability/security baseline. */
import { readFileSync } from 'node:fs';

const service = readFileSync('src/lib/services/zatca.service.ts', 'utf8');
const schema = readFileSync('src/db/schema.ts', 'utf8');
const migration = readFileSync('drizzle/0015_zatca_counter_guard.sql', 'utf8');
const immutableMigration = readFileSync('drizzle/0016_zatca_immutable_artifacts.sql', 'utf8');
const idempotencyMigration = readFileSync('drizzle/0017_zatca_idempotency.sql', 'utf8');
const activeInvoice = readFileSync('website-app/src/components/EInvoice.tsx', 'utf8');
const legacyInvoice = readFileSync('src/components/EInvoice.tsx', 'utf8');
const mobileApi = readFileSync('mobile-api/server.js', 'utf8');
const accounting = readFileSync('src/lib/services/accounting-sync.service.ts', 'utf8');
const accountingUi = readFileSync('website-app/src/components/AccountingIntegration.tsx', 'utf8');
const configRoute = readFileSync('src/app/api/finance/zatca/config/route.ts', 'utf8');
const issueRoute = readFileSync('src/app/api/finance/zatca/issue/route.ts', 'utf8');
const complianceUi = readFileSync('website-app/src/pages/ZatcaCompliance.tsx', 'utf8');
const checks = [
  [service.includes('developer-portal') && service.includes('sandbox'), 'ZATCA sandbox endpoint is explicit'],
  [service.includes('sha256Base64'), 'invoice hash uses base64 format'],
  [service.includes('credentialStatus') && service.includes('ZATCA_CREDENTIALS_CORRUPTED'), 'credential corruption is distinguished from missing configuration'],
  [service.includes('round2'), 'money calculations use cent rounding'],
  [service.includes('validateZatcaInvoiceInput'), 'invoice validation is wired'],
  [service.includes('ORDER_NOT_ELIGIBLE_FOR_ZATCA') && service.includes('DELIVERY_EVIDENCE_REQUIRED'), 'production issuance blocks ineligible/undelivered orders'],
  [service.includes('STANDARD_BUYER_VAT_REQUIRED'), 'production B2B issuance requires a VAT-registered buyer'],
  [service.includes('AbortSignal.timeout'), 'Fatoora timeout is bounded'],
  [service.includes('pg_advisory_xact_lock'), 'counter allocation is serialized'],
  [service.includes('submittedXml'), 'exact submitted XML is retained'],
  [service.includes('returnedQr'), 'Fatoora-returned QR is preferred'],
  [service.includes('businessRejection') && service.includes('httpStatus'), 'transport/auth/gateway failures are not misclassified as business rejections'],
  [service.includes('ZATCA_CONFIG_UPDATED'), 'config changes are audited'],
  [service.includes('clients.tenantId') && service.includes('deliverySites.tenantId'), 'order joins are tenant-scoped'],
  [schema.includes('zatca_documents_tenant_counter_unique'), 'schema declares tenant/counter uniqueness'],
  [schema.includes('zatca_documents_invoice_uuid_unique'), 'schema declares invoice UUID uniqueness'],
  [schema.includes('zatca_documents_tenant_invoice_number_unique'), 'schema declares tenant/invoice-number uniqueness'],
  [schema.includes('zatca_documents_tenant_idempotency_unique'), 'schema declares tenant/idempotency uniqueness'],
  [service.includes('idempotencyKey') && service.includes('findIdempotentDocument'), 'idempotent replay is wired into invoice issuance'],
  [service.includes('ZATCA_IDEMPOTENCY_KEY_REUSED'), 'idempotency keys cannot be reused for another order/type'],
  [issueRoute.includes('INVALID_IDEMPOTENCY_KEY'), 'idempotency headers have bounded validation'],
  [issueRoute.includes('delete safeDoc.fatooraResponse'), 'issue API does not return raw Fatoora payloads'],
  [idempotencyMigration.includes('CREATE UNIQUE INDEX'), 'migration creates idempotency uniqueness'],
  [migration.includes('CREATE UNIQUE INDEX'), 'migration creates uniqueness indexes'],
  [immutableMigration.includes('IMMUTABLE_ZATCA_ARTIFACT'), 'final ZATCA artifacts are protected by a trigger'],
  [activeInvoice.includes('import.meta.env.PROD') && activeInvoice.includes('ZATCA clearance required'), 'active local invoice preview is disabled in production'],
  [legacyInvoice.includes('import.meta.env.PROD') && legacyInvoice.includes('ZATCA clearance required'), 'legacy local invoice preview is disabled in production'],
  [mobileApi.includes('Local invoice preview disabled'), 'legacy mobile invoice route fails closed in production'],
  [accounting.includes('requireAcceptedZatcaDocument') && accounting.includes('ZATCA_ACCEPTANCE_REQUIRED'), 'accounting push is gated on accepted ZATCA status'],
  [accounting.includes('acceptedZatcaOrderIds'), 'accounting CSV export is limited to accepted ZATCA documents'],
  [accountingUi.includes('import.meta.env.PROD'), 'simulated accounting sync/export is disabled in production'],
  [configRoute.includes('PRODUCTION_CONFIRMATION_REQUIRED') && complianceUi.includes('window.confirm'), 'production environment selection requires explicit confirmation'],
];
const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}
console.log(`ZATCA static audit passed (${checks.length} checks).`);
