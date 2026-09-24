# ZATCA Engine Port Plan — invoice-sandpoint

**Source reviewed:** `engahmedabdoualyan-max/invoice-sandpoint` at commit `aaad151`
**Decision:** use the external project's proven ZATCA engine ideas; do not merge its Accounting/UI wholesale.

## What is useful to take

### Compliance engine

Port/adapt the following pure modules from `invoice-app/src/lib/zatca/`:

- `types.ts` — UBL/ZATCA input types and tax categories.
- `money.ts` — tax-category aggregation and VAT rounding.
- `xml.ts` — full UBL builder with ICV/PIH/QR placeholders, addresses, allowances, tax subtotals and credit/debit notes.
- `canonicalize.ts` + `hash.ts` — C14N and base64 invoice hash.
- `qr.ts` — TLV tags 1–9.
- `keys.ts` + `xades.ts` + `certificate.ts` + `asn1.ts` — ECDSA/CSID/XAdES artifacts.
- `validate.ts` — pre-submission business checks.
- `csr.ts` / CSR generator — only after reviewing the duplicate implementations.

The Fimto adapter must call `validateInvoice()` before building or submitting an invoice. The external project currently has this module but does not call it from the invoice service; that is a gap to fix during the port.

### Operational patterns

- protected monotonic counter (`InvoiceCounter`) with atomic increment.
- base64 PIH/hash normalization for legacy rows.
- persist exact signed UBL, UUID, hash, signature and QR.
- compliance/production CSID selection with encrypted private key at rest.
- separate regular invoice from ZATCA invoice.
- credit/debit note and billing-reference model.

## What must be adapted for Fimto

The external project is a single-company SQLite/Prisma application. Fimto is multi-tenant PostgreSQL/Drizzle. Do **not** copy these parts unchanged:

- `prisma.company.findFirst()` / single-company settings lookup.
- `prisma` models and `InvoiceCounter` global row.
- browser JWT-cookie auth.
- UI, customers, payments, reports and accounting pages.
- `settings` as a global company record.
- `companyId` authorization assumptions.

The Fimto adapter must use `auth.user.tenantId`, `tenant_id`, existing RBAC and PostgreSQL transactions.

## Immediate safe work in Fimto

1. Add the pure ZATCA engine under `src/lib/zatca/` with unit tests.
2. Add a tenant-aware adapter around the engine; do not replace the working Fatoora path until sandbox evidence passes.
3. Add `validateInvoice()` before invoice creation.
4. Add tenant predicates to order/client/site/mix joins.
5. Add timeout and persist the exact submission state/XML.
6. Add idempotency/duplicate protection and an atomic counter.
7. Store Fatoora returned `clearedInvoice`/QR/status, not only a locally generated QR.
8. Add audit events and a ZATCA health/status panel.
9. Run a sandbox contract test using a non-production CSID.

## Blocked until owner supplies/approves

- Production CSID/certificate onboarding decision.
- Whether the external service remains the certified EGS or Fimto owns the engine.
- One-invoice-per-order versus partial-invoice policy.
- Source of billed quantity: POD/approved delivery versus `remainingVolumeM3`.
- Production environment and service credentials.

Do not send CSID, private key, OTP, binary token, or secret through chat or Git.

## Security findings in the external repo to fix before reuse

- `/api/zatca/debug-csid` is unauthenticated and returns request/response previews; remove or protect it.
- `auth.ts` has a development JWT secret fallback that must fail closed in production.
- `getSigningPrivateKey()` and onboarding use a development passphrase fallback; remove it in production.
- CSR/private-key responses should not return private keys to the browser; use a server-side one-time handoff.
- Do not log CSR previews, OTP, response bodies or secrets.
- `zatcaBaseUrl` must be an allowlisted environment, not an arbitrary admin-provided URL.
- `reportInvoiceToZatca()` is single-company and needs tenant/company authorization when adapted.
- Report status must use the Fatoora body status/validation result, not HTTP 200 alone.
- `npm audit --omit=dev` في المصدر الخارجي حالياً: 1 critical (`xmldom`) و3 high (`prisma`/`deepmerge-ts`); لا تنقل dependencies قبل fix/upgrade verification.

## Accounting boundary

The external project includes accounting and invoice UI, but those are not copied into Fimto now. Fimto consumes the external invoice result and keeps the specialized accounting program as the ledger system of record.
