/**
 * Weighbridge governance — SHA-256 hash-chained ledger (mobile port).
 * Mirrors the website Governance module + ERP weighbridge service:
 * Net = Gross − Tare, each record links to the previous hash so any
 * retroactive edit breaks the chain (verifyChain detects it).
 * Concrete density 2400 kg/m³ converts weight ↔ volume for returns.
 */
import sha256 from "js-sha256";

export const CONCRETE_DENSITY_KG_PER_M3 = 2400;
export const WEIGH_TOLERANCE_PCT = 3;
export const BLOCK_M3_PER_UNIT = 1 / 80; // blocks = qty(m³) × 80

export interface WeighRecord {
  id: string;
  seq: number;
  plate: string;
  supplier?: string;
  material?: string;
  grossKg: number;
  tareKg: number;
  netKg: number;
  expectedKg?: number;
  verdict?: "ok" | "mismatch" | "pending";
  prevHash: string;
  hash: string;
  weighedAt: string;
  weighedBy?: string;
}

export type ReturnDisposition = "recycle" | "blocks" | "dispose";

export interface ReturnRecord {
  id: string;
  plate: string;
  site?: string;
  qtyM3: number;
  reason: string;
  disposition: ReturnDisposition;
  blocksMade?: number;
  returnedAt: string;
  loggedBy?: string;
}

function rid(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 0xffff).toString(36)}`;
}

export function sealWeighing(input: {
  plate: string;
  supplier?: string;
  material?: string;
  grossKg: number;
  tareKg: number;
  expectedKg?: number;
  prevHash?: string;
  seq?: number;
  weighedBy?: string;
}): WeighRecord {
  const netKg = Math.round((input.grossKg - input.tareKg) * 100) / 100;
  const seq = input.seq ?? 1;
  const prevHash = input.prevHash ?? "GENESIS";
  const weighedAt = new Date().toISOString();
  const hash = sha256(
    `${seq}|${input.plate}|${input.grossKg}|${input.tareKg}|${netKg}|${weighedAt}|${prevHash}`
  );
  let verdict: WeighRecord["verdict"] = "pending";
  if (input.expectedKg && input.expectedKg > 0) {
    const drift = Math.abs(netKg - input.expectedKg) / input.expectedKg;
    verdict = drift <= WEIGH_TOLERANCE_PCT / 100 ? "ok" : "mismatch";
  }
  return {
    id: rid(),
    seq,
    plate: input.plate,
    supplier: input.supplier,
    material: input.material,
    grossKg: input.grossKg,
    tareKg: input.tareKg,
    netKg,
    expectedKg: input.expectedKg,
    verdict,
    prevHash,
    hash,
    weighedAt,
    weighedBy: input.weighedBy,
  };
}

/** Recomputes the chain; returns the first broken record id, or null when intact. */
export function verifyChain(records: WeighRecord[]): string | null {
  const ordered = [...records].sort((a, b) => a.seq - b.seq);
  let prev = "GENESIS";
  for (const r of ordered) {
    if (r.prevHash !== prev) return r.id;
    const recomputed = sha256(
      `${r.seq}|${r.plate}|${r.grossKg}|${r.tareKg}|${r.netKg}|${r.weighedAt}|${r.prevHash}`
    );
    if (recomputed !== r.hash) return r.id;
    prev = r.hash;
  }
  return null;
}

export function blocksFromVolume(qtyM3: number): number {
  return Math.floor(qtyM3 / BLOCK_M3_PER_UNIT);
}

export function volumeFromWeight(netKg: number): number {
  return Math.round((netKg / CONCRETE_DENSITY_KG_PER_M3) * 100) / 100;
}
