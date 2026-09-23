/**
 * ============================================================
 *  Accounting connector framework (Epic 6)
 * ============================================================
 *
 *  Every provider implements AccountingConnector:
 *    ZOHO_BOOKS · QUICKBOOKS · CSV_BRIDGE (SAP/Oracle file bridge)
 *
 *  Credentials never touch logs — only external IDs + messages.
 *  AES-256-GCM helpers live here so connections store ciphertext.
 * ============================================================
 */

import crypto from "node:crypto";

export type AccountingProvider = "ZOHO_BOOKS" | "QUICKBOOKS" | "CSV_BRIDGE";

export const ACCOUNTING_PROVIDERS: { id: AccountingProvider; label: string }[] = [
  { id: "ZOHO_BOOKS", label: "Zoho Books" },
  { id: "QUICKBOOKS", label: "QuickBooks Online" },
  { id: "CSV_BRIDGE", label: "CSV Bridge (SAP / Oracle file import)" },
];

export interface PushCustomerInput {
  companyName: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  vatNumber?: string;
}

export interface InvoiceLine {
  description: string;
  quantityM3: number;
  rateSar: number;
}

export interface PushInvoiceInput {
  orderNumber: string;
  customerExternalId: string;
  customerName: string;
  lines: InvoiceLine[];
  currency: string;
  issueDate: string; // YYYY-MM-DD
  notes?: string;
}

export interface ConnectorResult {
  ok: boolean;
  externalId?: string;
  message: string;
}

export interface AccountingConnector {
  provider: AccountingProvider;
  testConnection(
    creds: Record<string, string>,
    settings: Record<string, unknown>
  ): Promise<ConnectorResult>;
  pushCustomer(
    creds: Record<string, string>,
    settings: Record<string, unknown>,
    input: PushCustomerInput
  ): Promise<ConnectorResult>;
  pushInvoice(
    creds: Record<string, string>,
    settings: Record<string, unknown>,
    input: PushInvoiceInput
  ): Promise<ConnectorResult>;
}

// ─── Credential encryption (AES-256-GCM) ──────────────────────────────────────

function cryptoKey(): Buffer {
  const hex = process.env.INTEGRATION_CRYPTO_KEY;
  if (hex && /^[0-9a-fA-F]{64}$/.test(hex)) {
    return Buffer.from(hex, "hex");
  }
  // Dev fallback — production MUST set INTEGRATION_CRYPTO_KEY (see .env.example)
  return crypto.scryptSync("fimto-integration-dev-only", "fimto-salt", 32);
}

/** Encrypts credential JSON → "iv:ciphertext:tag" (base64 parts). */
export function encryptSecrets(plain: Record<string, string>): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", cryptoKey(), iv);
  const ct = Buffer.concat([
    cipher.update(JSON.stringify(plain), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), ct.toString("base64"), tag.toString("base64")].join(":");
}

/** Decrypts what encryptSecrets produced. Throws on tamper. */
export function decryptSecrets(enc: string): Record<string, string> {
  const [ivB64, ctB64, tagB64] = enc.split(":");
  if (!ivB64 || !ctB64 || !tagB64) throw new Error("Malformed credential blob");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    cryptoKey(),
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(pt.toString("utf8")) as Record<string, string>;
}

// ─── OAuth access-token cache (per connection, in-memory) ─────────────────────
// Single-instance safe; multi-instance deployments refresh on expiry anyway
// because every connector validates expiry before reuse.

const tokenCache = new Map<string, { token: string; exp: number }>();

export function cachedToken(key: string): string | null {
  const hit = tokenCache.get(key);
  if (hit && hit.exp > Date.now() + 30_000) return hit.token;
  tokenCache.delete(key);
  return null;
}

export function storeToken(key: string, token: string, ttlSeconds: number): void {
  tokenCache.set(key, { token, exp: Date.now() + ttlSeconds * 1000 });
}

export function dropToken(key: string): void {
  tokenCache.delete(key);
}
