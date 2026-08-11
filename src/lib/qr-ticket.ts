/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  QR Code & Barcode Verification Loop
 *  src/lib/qr-ticket.ts
 * ============================================================
 *
 *  PURPOSE
 *  ─────────────────────────────────────────────────────────
 *  When a mixer departs the plant (DEP_PLANT) the delivery ticket
 *  API mints an IMMUTABLE, ENCRYPTED QR payload carrying:
 *
 *      trip_id + client_id + mix_design_code + loaded_qty
 *
 *  The driver displays this QR on their phone. At the construction
 *  site the client's engineer (or the salesman) scans it with the
 *  mobile app. The backend then:
 *
 *    1. DECRYPTS + VERIFIES the payload signature
 *    2. CROSS-CHECKS the scanned site against the order's site
 *    3. BLOCKS unloading if the truck is at the WRONG project
 *    4. AUTO-STAMPS the ARR_SITE checkpoint on success
 *
 *  CRYPTOGRAPHY
 *  ─────────────────────────────────────────────────────────
 *  • AES-256-GCM authenticated encryption (confidentiality +
 *    integrity in one primitive — a tampered ciphertext fails
 *    the auth-tag check and cannot be decrypted at all).
 *  • Key derived via scrypt from QR_SECRET so the raw env var is
 *    never used directly as a key.
 *  • A random 12-byte IV per token → identical payloads produce
 *    different ciphertexts (no pattern leakage across tickets).
 *  • Token format: v1.<iv_b64url>.<tag_b64url>.<ciphertext_b64url>
 *
 *  WHY ENCRYPTED, NOT JUST SIGNED?
 *  A signed-but-readable QR would leak client identity, mix design
 *  and quantities to anyone who photographs the driver's screen.
 *  Encryption keeps commercial terms confidential while the GCM
 *  auth tag still guarantees tamper-evidence.
 * ============================================================
 */

import crypto from "crypto";

// ─── Key Derivation ───────────────────────────────────────────────────────────

const QR_SECRET =
  process.env.QR_SECRET ?? "fimto-qr-dev-secret-change-in-production-please";

/** Static salt — rotating this invalidates every previously minted QR. */
const KEY_SALT = "fimto-qr-ticket-v1";

/** Derived once per process (scrypt is deliberately expensive). */
const ENCRYPTION_KEY: Buffer = crypto.scryptSync(QR_SECRET, KEY_SALT, 32);

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;   // GCM standard nonce length
const TAG_LENGTH = 16;
const TOKEN_VERSION = "v1";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The exact payload sealed inside every delivery-ticket QR code.
 * Field names are kept short because QR density grows with payload size.
 */
export interface QrTicketPayload {
  /** trip_id */
  t: string;
  /** client_id */
  c: string;
  /** mix_design_code (e.g. "C30-S4") */
  m: string;
  /** loaded_qty in m³ */
  q: number;
  /** delivery_site_id — used for the wrong-site guard */
  s: string;
  /** delivery ticket number (human-readable cross-reference) */
  d: string;
  /** issued-at epoch milliseconds */
  i: number;
  /** vehicle plate — lets the scanner visually confirm the truck */
  v: string;
}

/** Decoded + validated payload returned to callers in readable form. */
export interface DecodedQrTicket {
  tripId: string;
  clientId: string;
  mixDesignCode: string;
  loadedQtyM3: number;
  deliverySiteId: string;
  deliveryTicketNumber: string;
  issuedAt: Date;
  plateNumber: string;
}

export type QrFailureReason =
  | "MALFORMED_TOKEN"
  | "UNSUPPORTED_VERSION"
  | "DECRYPTION_FAILED"
  | "TAMPERED_PAYLOAD"
  | "EXPIRED";

export class QrTicketError extends Error {
  public readonly reason: QrFailureReason;
  constructor(reason: QrFailureReason, message: string) {
    super(message);
    this.name = "QrTicketError";
    this.reason = reason;
    Object.setPrototypeOf(this, QrTicketError.prototype);
  }
}

// ─── Base64URL helpers (QR-safe: no +, /, or = padding) ───────────────────────

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

// ─── Minting ──────────────────────────────────────────────────────────────────

/**
 * Mints an immutable encrypted QR token for a delivery ticket.
 * Called exactly once, at the DEP_PLANT checkpoint.
 *
 * The returned string is what gets rendered as a QR code on the
 * driver's phone and persisted to `trips.qr_code_token`.
 */
export function mintTicketQr(input: {
  tripId: string;
  clientId: string;
  mixDesignCode: string;
  loadedQtyM3: number;
  deliverySiteId: string;
  deliveryTicketNumber: string;
  plateNumber: string;
}): string {
  const payload: QrTicketPayload = {
    t: input.tripId,
    c: input.clientId,
    m: input.mixDesignCode,
    q: input.loadedQtyM3,
    s: input.deliverySiteId,
    d: input.deliveryTicketNumber,
    i: Date.now(),
    v: input.plateNumber,
  };

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [TOKEN_VERSION, b64url(iv), b64url(authTag), b64url(ciphertext)].join(".");
}

/**
 * Mints a compact QR token for a weighbridge slip so auditors can scan a
 * printed ticket and confirm it matches the sealed hash-chain record.
 */
export function mintWeighbridgeQr(input: {
  transactionId: string;
  ticketNumber: string;
  netWeightKg: number;
  recordHash: string;
}): string {
  const payload = {
    t: input.transactionId,
    d: input.ticketNumber,
    q: input.netWeightKg,
    // First 16 hex chars of the chain hash is enough to bind the slip to
    // the ledger row without bloating the QR.
    h: input.recordHash.slice(0, 16),
    i: Date.now(),
  };

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(payload), "utf8")),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [TOKEN_VERSION, b64url(iv), b64url(authTag), b64url(ciphertext)].join(".");
}

/**
 * Mints the permanent placard token affixed to a physical silo.
 * Unlike ticket QRs this is deterministic (no timestamp) so the printed
 * placard stays valid for the life of the silo.
 */
export function mintSiloQr(input: { siloId: string; siloCode: string }): string {
  const payload = { s: input.siloId, k: input.siloCode };

  // Deterministic IV derived from the silo id so re-minting yields the same
  // token — the placard never has to be reprinted.
  const iv = crypto
    .createHash("sha256")
    .update(`silo-iv:${input.siloId}`)
    .digest()
    .subarray(0, IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(payload), "utf8")),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [TOKEN_VERSION, b64url(iv), b64url(authTag), b64url(ciphertext)].join(".");
}

// ─── Verification ─────────────────────────────────────────────────────────────

/**
 * Decrypts and authenticates a QR token.
 *
 * Throws `QrTicketError` when the token is malformed, was produced with a
 * different key, or has been tampered with (GCM auth-tag mismatch).
 *
 * @param maxAgeMs Optional freshness window. Delivery tickets are only valid
 *                 for the duration of the haul — a 24h default prevents an
 *                 old screenshot being replayed weeks later.
 */
export function verifyTicketQr(
  token: string,
  maxAgeMs: number = 24 * 60 * 60 * 1000
): DecodedQrTicket {
  const parts = token.trim().split(".");
  if (parts.length !== 4) {
    throw new QrTicketError(
      "MALFORMED_TOKEN",
      "QR token structure is invalid. Expected 4 dot-separated segments."
    );
  }

  const [version, ivPart, tagPart, dataPart] = parts;

  if (version !== TOKEN_VERSION) {
    throw new QrTicketError(
      "UNSUPPORTED_VERSION",
      `QR token version "${version}" is not supported by this server.`
    );
  }

  let payload: QrTicketPayload;
  try {
    const iv = fromB64url(ivPart);
    const authTag = fromB64url(tagPart);
    const ciphertext = fromB64url(dataPart);

    if (iv.length !== IV_LENGTH || authTag.length !== TAG_LENGTH) {
      throw new Error("bad iv/tag length");
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    payload = JSON.parse(plaintext.toString("utf8")) as QrTicketPayload;
  } catch {
    // GCM auth failure lands here — the payload was altered or the key differs.
    throw new QrTicketError(
      "TAMPERED_PAYLOAD",
      "QR code failed authentication. It was modified, corrupted, or issued by a different system."
    );
  }

  if (!payload?.t || !payload?.c || !payload?.s) {
    throw new QrTicketError(
      "DECRYPTION_FAILED",
      "QR payload decrypted but is missing required fields."
    );
  }

  const issuedAt = new Date(payload.i);
  if (maxAgeMs > 0 && Date.now() - payload.i > maxAgeMs) {
    throw new QrTicketError(
      "EXPIRED",
      `QR code expired. Issued ${issuedAt.toISOString()}, valid for ${Math.round(maxAgeMs / 3600000)}h.`
    );
  }

  return {
    tripId: payload.t,
    clientId: payload.c,
    mixDesignCode: payload.m,
    loadedQtyM3: payload.q,
    deliverySiteId: payload.s,
    deliveryTicketNumber: payload.d,
    issuedAt,
    plateNumber: payload.v,
  };
}

/**
 * Decodes a silo placard token. Used when a TIPPER driver scans the bin
 * before discharging raw material.
 */
export function verifySiloQr(token: string): { siloId: string; siloCode: string } {
  const parts = token.trim().split(".");
  if (parts.length !== 4 || parts[0] !== TOKEN_VERSION) {
    throw new QrTicketError("MALFORMED_TOKEN", "Silo QR token is malformed.");
  }
  try {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      ENCRYPTION_KEY,
      fromB64url(parts[1])
    );
    decipher.setAuthTag(fromB64url(parts[2]));
    const plaintext = Buffer.concat([
      decipher.update(fromB64url(parts[3])),
      decipher.final(),
    ]);
    const p = JSON.parse(plaintext.toString("utf8")) as { s: string; k: string };
    return { siloId: p.s, siloCode: p.k };
  } catch {
    throw new QrTicketError(
      "TAMPERED_PAYLOAD",
      "Silo QR failed authentication — placard may be counterfeit."
    );
  }
}

// ─── Geo Helper (wrong-site guard) ────────────────────────────────────────────

/** Haversine distance in metres between two GPS coordinates. */
export function distanceMetres(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
