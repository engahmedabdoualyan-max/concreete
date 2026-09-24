# ZATCA Adapter Contract (Fimto ↔ external invoice-sandpoint)

> Contract proposal only. It does not create an accounting integration and does not replace the external certified EGS.

## Request

`POST /internal/zatca/invoices/issue`

Headers:

```text
Authorization: Bearer <service credential>
X-Idempotency-Key: <stable key per tenant/order/invoice attempt>
X-Tenant-Id: <Fimto tenant UUID>
Content-Type: application/json
```

Body:

```json
{
  "source": "FIMTO",
  "sourceOrderId": "uuid",
  "sourceOrderNumber": "ORD-2026-0001",
  "customer": {
    "name": "Customer legal name",
    "vatNumber": "15-digit VAT or null",
    "crNumber": "optional",
    "address": {}
  },
  "sellerSnapshot": {},
  "lines": [
    {
      "description": "Concrete mix",
      "quantity": 10,
      "unit": "M3",
      "unitPrice": 100,
      "taxCategory": "S"
    }
  ],
  "documentType": "invoice",
  "invoiceKind": "STANDARD",
  "issueDate": "YYYY-MM-DD",
  "deliveryReference": "POD-or-approved-delivery reference"
}
```

Rules:

- Fimto sends an approved order/POD snapshot, never a client-provided role or seller config.
- No password, OTP, private key, CSID, or Fatoora token crosses this boundary.
- The same idempotency key must return the same invoice result, including after timeout.

## Response

```json
{
  "externalInvoiceId": "string",
  "uuid": "uuid",
  "invoiceNumber": "INV-000001",
  "status": "PENDING|CLEARED|REPORTED|REJECTED",
  "invoiceHash": "base64",
  "previousInvoiceHash": "base64",
  "qr": "base64-tlv-or-null",
  "clearedInvoice": "base64-xml-or-null",
  "validationResults": {},
  "submittedAt": "ISO timestamp"
}
```

Fimto persists the response as immutable evidence and never marks an invoice `CLEARED` only because HTTP status was 200.

## Failure/retry rules

- `PENDING`: credentials/configuration not ready or submission outcome unknown.
- `RETRYABLE`: timeout/5xx before an unknown acceptance; retry with the same idempotency key and UUID.
- `REJECTED`: validation/business rejection; do not automatically retry.
- `UNKNOWN`: reconcile by UUID/hash before creating another invoice.
- A partial success must never create a second invoice.

## Authorization

- Fimto service identity is separate from browser/admin sessions.
- External service validates tenant/source mapping and role.
- Only `SUPER_ADMIN`/approved finance role can change CSID or production settings.
- Report/share/download endpoints require scoped tokens and audit events.

## Minimum evidence before production

- Sandbox contract test.
- Production-like certificate/CSID test without exposing private keys.
- Golden XML/hash/QR evidence.
- Two-tenant negative tests.
- Timeout + same-idempotency replay test.
- Confirm external service does not use arbitrary `zatcaBaseUrl`.
- Confirm external debug endpoints and secret fallbacks are disabled.
