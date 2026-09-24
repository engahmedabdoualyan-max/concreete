import assert from "node:assert/strict";
import {
  PERMISSIONS,
  isValidRole,
  userHasAnyPermission,
  userHasPermission,
} from "../src/lib/auth/rbac";
import { assertTenantId, enforceTenantAnalytics } from "../src/lib/tenant";
import { checkNextRateLimit, clientIpFromHeaders } from "../src/lib/rate-limit";
import {
  CHECKPOINT_ORDER,
  getNextCheckpoint,
  isValidCheckpointProgression,
} from "../src/lib/services/dispatch.service";
import { mintTicketQr, QrTicketError, verifyTicketQr } from "../src/lib/qr-ticket";

const tenantId = "11111111-1111-4111-8111-111111111111";
const otherTenantId = "22222222-2222-4222-8222-222222222222";

assert.equal(assertTenantId(tenantId), tenantId);
assert.throws(() => assertTenantId("not-a-uuid"), /TENANT_CONTEXT_REQUIRED/);
assert.throws(() => assertTenantId(null), /TENANT_CONTEXT_REQUIRED/);
assert.equal(enforceTenantAnalytics({ tenantId, userId: "u1", role: "FINANCE", permissions: [] }), tenantId);
assert.equal(
  enforceTenantAnalytics({ tenantId, userId: "u1", role: "SUPER_ADMIN", permissions: [] }, true),
  null
);

assert.equal(userHasPermission("FINANCE", [], PERMISSIONS.FINANCE_INVOICE_MANAGE), true);
assert.equal(userHasPermission("DRIVER", [], PERMISSIONS.FINANCE_INVOICE_MANAGE), false);
assert.equal(userHasPermission("DRIVER", [PERMISSIONS.FINANCE_INVOICE_MANAGE], PERMISSIONS.FINANCE_INVOICE_MANAGE), true);
assert.equal(userHasPermission("SUPER_ADMIN", [], PERMISSIONS.SYSTEM_SETTINGS), true);
assert.equal(
  userHasAnyPermission("SALES_REP", [], [PERMISSIONS.ORDER_CREATE, PERMISSIONS.SYSTEM_SETTINGS]),
  true
);
assert.equal(isValidRole("FINANCE"), true);
assert.equal(isValidRole("NOT_A_ROLE"), false);
assert.equal(CHECKPOINT_ORDER.length, 7);
for (let i = 0; i < CHECKPOINT_ORDER.length - 1; i += 1) {
  assert.equal(getNextCheckpoint(CHECKPOINT_ORDER[i]), CHECKPOINT_ORDER[i + 1]);
  assert.equal(isValidCheckpointProgression(CHECKPOINT_ORDER[i], CHECKPOINT_ORDER[i + 1]), true);
}
assert.equal(getNextCheckpoint(CHECKPOINT_ORDER[CHECKPOINT_ORDER.length - 1]), null);
assert.equal(isValidCheckpointProgression("ARR_PLANT", "ARR_SITE"), false);
assert.equal(isValidCheckpointProgression("RETURN_PLANT", "ARR_PLANT"), false);

const qrToken = mintTicketQr({
  tripId: "trip-1",
  clientId: "client-1",
  mixDesignCode: "C30-S4",
  loadedQtyM3: 8.5,
  deliverySiteId: "site-1",
  deliveryTicketNumber: "TKT-1",
  plateNumber: "ABC123",
});
const decodedQr = verifyTicketQr(qrToken);
assert.equal(decodedQr.tripId, "trip-1");
assert.equal(decodedQr.loadedQtyM3, 8.5);
const qrParts = qrToken.split(".");
qrParts[3] = `${qrParts[3][0] === "A" ? "B" : "A"}${qrParts[3].slice(1)}`;
const tamperedQr = qrParts.join(".");
assert.throws(
  () => verifyTicketQr(tamperedQr),
  (error: unknown) => error instanceof QrTicketError && error.reason === "TAMPERED_PAYLOAD"
);
const realNow = Date.now;
Date.now = () => realNow() + 25 * 60 * 60 * 1000;
try {
  assert.throws(
    () => verifyTicketQr(qrToken),
    (error: unknown) => error instanceof QrTicketError && error.reason === "EXPIRED"
  );
} finally {
  Date.now = realNow;
}

const key = `security-smoke-${Date.now()}-${Math.random()}`;
assert.equal(checkNextRateLimit(key, 2, 60_000).allowed, true);
assert.equal(checkNextRateLimit(key, 2, 60_000).allowed, true);
const limited = checkNextRateLimit(key, 2, 60_000);
assert.equal(limited.allowed, false);
assert.equal(limited.retryAfterSeconds > 0, true);
assert.notEqual(tenantId, otherTenantId);
assert.equal(
  clientIpFromHeaders(new Headers({ "x-forwarded-for": "2001:db8::1, 10.0.0.1" })),
  "2001:db8::1"
);
assert.equal(clientIpFromHeaders(new Headers({ "x-forwarded-for": "not-an-ip" })), "unknown");
assert.equal(clientIpFromHeaders(new Headers({ "x-real-ip": "192.0.2.10" })), "192.0.2.10");

console.log("Security unit smoke passed.");
