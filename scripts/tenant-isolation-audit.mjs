#!/usr/bin/env node
/** Static regression guard for representative tenant-scoped API routes. */
import { readFileSync } from 'node:fs';

const files = [
  'src/lib/auth/middleware.ts',
  'src/app/api/auth/refresh/route.ts',
  'src/app/api/auth/logout/route.ts',
  'src/app/api/auth/delete-account/route.ts',
  'src/app/api/workspace/[collection]/route.ts',
  'src/app/api/quality/environment-compensation/route.ts',
  'src/app/api/finance/[orderId]/override/route.ts',
  'src/app/api/finance/evaluate-credit/route.ts',
  'src/app/api/dispatch/[tripId]/live-location/route.ts',
  'src/app/api/weighbridge/route.ts',
  'src/app/api/returns/route.ts',
  'src/app/api/fuel-log/route.ts',
  'src/app/api/driver-bonus/route.ts',
  'src/app/api/evaluation/route.ts',
  'src/app/api/orders/route.ts',
  'src/app/api/finance/route.ts',
  'src/app/api/finance/approve/route.ts',
  'src/app/api/dispatch/route.ts',
  'src/app/api/dispatch/[tripId]/checkpoint/route.ts',
  'src/app/api/dispatch/verify-ticket-qr/route.ts',
  'src/app/api/fleet/route.ts',
  'src/app/api/fleet/pump-sessions/route.ts',
  'src/app/api/inventory/route.ts',
  'src/app/api/batching/start/route.ts',
  'src/app/api/quality/route.ts',
  'src/app/api/workshop/route.ts',
];
const failures = [];
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const hasTenantBoundary = (file.endsWith('middleware.ts') || file.endsWith('auth/refresh/route.ts'))
    ? source.includes('payload.tenantId') && source.includes('userSessions.tenantId')
    : source.includes('auth.user.tenantId');
  if (!hasTenantBoundary) {
    failures.push(`${file}: no auth.user.tenantId guard found`);
  }
}
if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL ${failure}`));
  process.exit(1);
}
console.log(`Tenant-isolation static audit passed (${files.length} route/middleware files).`);
