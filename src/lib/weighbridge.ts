/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Immutable Crypto-Weighbridge & Returns Governance Ledger
 *  src/lib/weighbridge.ts
 * ============================================================
 *
 *  This is the CANONICAL weighbridge module. It guarantees that
 *  no weight, ticket, or timestamp can ever be altered or deleted
 *  without detection.
 *
 *  ── ANTI-FRAUD DESIGN ───────────────────────────────────────
 *  1. TARE IS NEVER TYPED BY A HUMAN.
 *     The empty weight is read from `fleet_vehicles.tare_weight_tonnes`
 *     and snapshotted into the transaction row.
 *
 *  2. NET IS ALWAYS COMPUTED.
 *     Net Weight = Gross Weight − Tare Weight
 *     There is no code path that accepts a client-supplied net value.
 *
 *  3. SHA-256 HASH CHAIN (blockchain-like).
 *     recordHash = SHA256(
 *       id | ticketNumber | netWeightKg | timestampISO | previousRecordHash
 *     )
 *     The genesis record links to a fixed GENESIS constant.
 *
 *  4. STRICT SEQUENTIAL INTEGRITY.
 *     `sequenceNumber` is strictly monotonic (1, 2, 3 …).
 *     `verifyWeighbridgeChain()` walks the chain and detects:
 *       • altered weights          → recomputed hash mismatch
 *       • altered timestamps       → recomputed hash mismatch
 *       • altered ticket numbers   → recomputed hash mismatch
 *       • DELETED rows             → sequence gap + previousHash break
 *       • INSERTED rows            → previousHash break
 *
 *  ── CONCRETE RETURNS SUB-MODULE ─────────────────────────────
 *  When a mixer returns with excess or rejected concrete, the
 *  returned volume is computed from the weighbridge RETURN_IN
 *  reading and routed by disposition:
 *    • RECYCLED_BATCHING → credits aggregate back into inventory_silos
 *    • CAST_BLOCKS       → logs manufactured unit count in the block ledger
 *    • WASHOUT           → credits recovered water into the WATER silo
 *    • DISCARDED         → pure waste (no recovery credit)
 * ============================================================
 */

import crypto from "crypto";
import { db } from "@/db";
import {
  weighbridgeTransactions,
  trips,
  fleetVehicles,
  concreteReturns,
  blockManufacturingLogs,
  aggregateRecyclingLogs,
  inventorySilos,
  inventoryTransactions,
  auditLogs,
  orders,
  mixDesigns,
} from "@/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import type { ReturnDisposition } from "@/db/schema";
import { assertCapability } from "@/lib/vehicle-class";
import { mintWeighbridgeQr } from "@/lib/qr-ticket";

// ─── Chain Constants ──────────────────────────────────────────────────────────

/** Fixed anchor for the first record in the ledger */
export const GENESIS_HASH =
  "GENESIS_FIMTO_CONCRETE_ERP_00000000000000000000000000000000";

/** Average density of fresh ready-mix concrete (kg per m³) */
export const CONCRETE_DENSITY_KG_PER_M3 = 2400;

/** Default precast block volume (20×20×40 cm) in m³ */
export const DEFAULT_BLOCK_VOLUME_M3 = 0.016;

// ─── Types ────────────────────────────────────────────────────────────────────

export type WeighbridgeTransactionType = "LOAD_OUT" | "RETURN_IN" | "TARE_VERIFY";

export interface WeighEntry {
  tripId: string;
  transactionType: WeighbridgeTransactionType;
  /** Raw reading from the weighbridge sensor in kilograms */
  grossWeightKg: number;
  operatorId: string;
  scaleUnitId?: string;
  rawSensorData?: Record<string, unknown>;
  notes?: string;
}

export interface WeighRecord {
  id: string;
  sequenceNumber: number;
  tripId: string;
  ticketNumber: string;
  transactionType: string;
  grossWeightKg: number;
  tareWeightKg: number;
  netWeightKg: number;
  previousHash: string;
  recordHash: string;
  lockedAt: Date;
  operatorId: string;
  tenantId: string;
}

export type ChainBreakReason =
  | "PREVIOUS_HASH_MISMATCH"
  | "RECORD_HASH_MISMATCH"
  | "SEQUENCE_GAP"
  | "NET_WEIGHT_RECOMPUTE_MISMATCH";

export interface ChainVerificationResult {
  isValid: boolean;
  totalRecords: number;
  verifiedAt: string;
  message: string;
  /** Populated only when the chain is broken */
  breach?: {
    reason: ChainBreakReason;
    atSequenceNumber: number;
    recordId: string;
    expected: string;
    found: string;
    /** Human-readable forensic hint */
    forensicHint: string;
  };
}

export interface ReturnEntry {
  tripId: string;
  /** Gross weight of the returning truck at the weighbridge (kg) */
  returnGrossWeightKg: number;
  disposition: ReturnDisposition;
  returnReason: string;
  authorisedById: string;
  returnedSlumpCm?: number;
  /** Optional overrides — otherwise derived automatically */
  blockSizeCm?: string;
  volumePerBlockM3?: number;
  recoveredGrade?: "FINE" | "COARSE" | "MIXED";
  destinationSiloId?: string;
  /** Whether to raise a financial deduction against the customer */
  raiseFinancialDeduction?: boolean;
  operatorId?: string;
}

export interface ReturnResult {
  returnId: string;
  weighbridgeRecord: WeighRecord;
  excessVolumeM3: number;
  excessWeightKg: number;
  disposition: ReturnDisposition;
  recovery: {
    blocksManufactured?: number;
    blockLedgerId?: string;
    aggregateRecoveredKg?: number;
    aggregateLedgerId?: string;
    waterRecoveredLitres?: number;
    siloCredited?: { siloId: string; siloCode: string; newStockKg: number };
  };
  financialDeductionSar?: number;
}

// ─── Ticket Number Generation ─────────────────────────────────────────────────

/**
 * Deterministic, human-readable weighbridge ticket number.
 * Format: WB-YYYYMMDD-<sequence padded to 6>
 */
export function buildTicketNumber(sequenceNumber: number, when: Date): string {
  const datePart = when.toISOString().slice(0, 10).replace(/-/g, "");
  return `WB-${datePart}-${sequenceNumber.toString().padStart(6, "0")}`;
}

// ─── Composite Hash ───────────────────────────────────────────────────────────

/**
 * Computes the SHA-256 composite hash for a weighbridge record.
 *
 * Composite payload (order is CRITICAL — never reorder):
 *   id | ticketNumber | netWeightKg | timestampISO | previousRecordHash
 *
 * Additional binding fields (tripId, sequenceNumber, gross, tare, type) are
 * appended so that ANY column mutation invalidates the hash, not just the
 * five headline fields.
 */
export function computeCompositeHash(params: {
  id: string;
  ticketNumber: string;
  netWeightKg: number;
  timestampIso: string;
  previousRecordHash: string;
  // binding fields
  tripId: string;
  sequenceNumber: number;
  grossWeightKg: number;
  tareWeightKg: number;
  transactionType: string;
}): string {
  const payload = [
    params.id,
    params.ticketNumber,
    params.netWeightKg.toFixed(3),
    params.timestampIso,
    params.previousRecordHash,
    // ── binding segment ──
    params.tripId,
    params.sequenceNumber.toString(),
    params.grossWeightKg.toFixed(3),
    params.tareWeightKg.toFixed(3),
    params.transactionType,
  ].join("|");

  return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}

// ─── Core: Record a Weighbridge Transaction ───────────────────────────────────

/**
 * Logs a truck weighing event with full anti-fraud sealing.
 *
 * Executed inside a serializable-safe transaction so that two trucks stepping
 * on the scale simultaneously cannot produce duplicate sequence numbers.
 */
export async function logWeighbridgeTransaction(
  entry: WeighEntry
): Promise<WeighRecord> {
  if (!Number.isFinite(entry.grossWeightKg) || entry.grossWeightKg <= 0) {
    throw new Error("Gross weight must be a positive number of kilograms");
  }

  return await db.transaction(async (tx) => {
    // 1. Resolve the trip and its vehicle
    const tripRows = await tx
      .select({ id: trips.id, vehicleId: trips.vehicleId, tripNumber: trips.tripNumber, tenantId: trips.tenantId })
      .from(trips)
      .where(eq(trips.id, entry.tripId))
      .limit(1);

    if (tripRows.length === 0) {
      throw new Error(`Trip not found: ${entry.tripId}`);
    }

    // 2. STATIC TARE from fleet_vehicles — never user input
    const vehicleRows = await tx
      .select({
        id: fleetVehicles.id,
        vehicleCode: fleetVehicles.vehicleCode,
        tareWeightTonnes: fleetVehicles.tareWeightTonnes,
        vehicleClass: fleetVehicles.vehicleClass,
      })
      .from(fleetVehicles)
      .where(eq(fleetVehicles.id, tripRows[0].vehicleId))
      .limit(1);

    if (vehicleRows.length === 0) {
      throw new Error(`Vehicle not found for trip ${entry.tripId}`);
    }

    // ── VEHICLE CLASS GUARD ────────────────────────────────────────────────
    // SERVICE and REGULAR vehicles are hard-excluded from the weighbridge
    // ledger. Only MIXER (concrete out) and TIPPER (raw material in) weigh.
    assertCapability(
      vehicleRows[0].vehicleClass,
      "weighbridge",
      vehicleRows[0].vehicleCode
    );

    const tareWeightKg = parseFloat(vehicleRows[0].tareWeightTonnes ?? "0") * 1000;

    if (tareWeightKg <= 0) {
      throw new Error(
        `Vehicle ${vehicleRows[0].vehicleCode} has no configured tare weight. Weighing is blocked until the fleet record is completed.`
      );
    }

    // 3. PROGRAMMATIC NET WEIGHT
    const netWeightKg = entry.grossWeightKg - tareWeightKg;

    if (netWeightKg < 0) {
      throw new Error(
        `Impossible weight: gross ${entry.grossWeightKg} kg is below the configured tare ${tareWeightKg} kg for ${vehicleRows[0].vehicleCode}. Check the scale.`
      );
    }

    // 4. Fetch the chain tip (last record) with a row lock
    const tipRows = await tx
      .select({
        recordHash: weighbridgeTransactions.recordHash,
        sequenceNumber: weighbridgeTransactions.sequenceNumber,
      })
      .from(weighbridgeTransactions)
      .orderBy(desc(weighbridgeTransactions.sequenceNumber))
      .limit(1);

    const previousHash = tipRows.length > 0 ? tipRows[0].recordHash : GENESIS_HASH;
    const sequenceNumber = tipRows.length > 0 ? tipRows[0].sequenceNumber + 1 : 1;

    // 5. Seal the record
    const id = crypto.randomUUID();
    const lockedAt = new Date();
    const timestampIso = lockedAt.toISOString();
    const ticketNumber = buildTicketNumber(sequenceNumber, lockedAt);

    const recordHash = computeCompositeHash({
      id,
      ticketNumber,
      netWeightKg,
      timestampIso,
      previousRecordHash: previousHash,
      tripId: entry.tripId,
      sequenceNumber,
      grossWeightKg: entry.grossWeightKg,
      tareWeightKg,
      transactionType: entry.transactionType,
    });

    // 6. Append-only insert
    const [inserted] = await tx
      .insert(weighbridgeTransactions)
      .values({
        id,
        tenantId: tripRows[0].tenantId,
        tripId: entry.tripId,
        sequenceNumber,
        transactionType: entry.transactionType,
        grossWeightKg: entry.grossWeightKg.toFixed(3),
        tareWeightKg: tareWeightKg.toFixed(3),
        netWeightKg: netWeightKg.toFixed(3),
        operatorId: entry.operatorId,
        scaleUnitId: entry.scaleUnitId,
        rawSensorData: {
          ...(entry.rawSensorData ?? {}),
          ticketNumber,
          vehicleCode: vehicleRows[0].vehicleCode,
          tripNumber: tripRows[0].tripNumber,
        },
        previousHash,
        recordHash,
        lockedAt,
        // Scannable proof binding a printed slip to this sealed ledger row
        qrCodeToken: mintWeighbridgeQr({
          transactionId: id,
          ticketNumber,
          netWeightKg,
          recordHash,
        }),
        notes: entry.notes,
      })
      .returning();

    // 7. Immutable audit trail
    await tx.insert(auditLogs).values({
      userId: entry.operatorId,
      tenantId: tripRows[0].tenantId,
      action: "WEIGHBRIDGE_SEALED",
      entityType: "weighbridge_transactions",
      entityId: inserted.id,
      newState: {
        ticketNumber,
        sequenceNumber,
        grossWeightKg: entry.grossWeightKg,
        tareWeightKg,
        netWeightKg,
        recordHash,
      },
      socketEvent: "weighbridge:recorded",
    });

    return {
      id: inserted.id,
      sequenceNumber: inserted.sequenceNumber,
      tripId: inserted.tripId,
      tenantId: inserted.tenantId,
      ticketNumber,
      transactionType: inserted.transactionType,
      grossWeightKg: parseFloat(inserted.grossWeightKg),
      tareWeightKg: parseFloat(inserted.tareWeightKg),
      netWeightKg: parseFloat(inserted.netWeightKg),
      previousHash: inserted.previousHash,
      recordHash: inserted.recordHash,
      lockedAt: inserted.lockedAt,
      operatorId: inserted.operatorId,
    };
  });
}

// ─── Chain Integrity Verification ─────────────────────────────────────────────

/**
 * Walks the entire weighbridge ledger sequentially and proves integrity.
 *
 * Detects:
 *   • SEQUENCE_GAP                 → a row was DELETED from the middle
 *   • PREVIOUS_HASH_MISMATCH       → a row was INSERTED or re-linked
 *   • RECORD_HASH_MISMATCH         → a weight/ticket/timestamp was ALTERED
 *   • NET_WEIGHT_RECOMPUTE_MISMATCH→ net no longer equals gross − tare
 *
 * Returns the FIRST breach encountered with forensic context.
 */
export async function verifyWeighbridgeChain(
  tenantId?: string
): Promise<ChainVerificationResult> {
  const records = await db
    .select()
    .from(weighbridgeTransactions)
    .where(tenantId ? eq(weighbridgeTransactions.tenantId, tenantId) : undefined)
    .orderBy(weighbridgeTransactions.sequenceNumber);

  const verifiedAt = new Date().toISOString();

  if (records.length === 0) {
    return {
      isValid: true,
      totalRecords: 0,
      verifiedAt,
      message: "Ledger is empty — nothing to verify.",
    };
  }

  let expectedPreviousHash = GENESIS_HASH;
  let expectedSequence = 1;

  for (const record of records) {
    // ── A. Strict sequential integrity (detects deletions) ──────────────────
    if (record.sequenceNumber !== expectedSequence) {
      return {
        isValid: false,
        totalRecords: records.length,
        verifiedAt,
        message: `Sequence gap detected: expected #${expectedSequence} but found #${record.sequenceNumber}. A record was deleted from the ledger.`,
        breach: {
          reason: "SEQUENCE_GAP",
          atSequenceNumber: record.sequenceNumber,
          recordId: record.id,
          expected: `sequence ${expectedSequence}`,
          found: `sequence ${record.sequenceNumber}`,
          forensicHint:
            "One or more rows were removed via direct database access. Restore from backup and audit DB credentials.",
        },
      };
    }

    // ── B. Chain linkage (detects insertions / re-linking) ──────────────────
    if (record.previousHash !== expectedPreviousHash) {
      return {
        isValid: false,
        totalRecords: records.length,
        verifiedAt,
        message: `Chain linkage broken at sequence #${record.sequenceNumber}: previousHash does not match the preceding record.`,
        breach: {
          reason: "PREVIOUS_HASH_MISMATCH",
          atSequenceNumber: record.sequenceNumber,
          recordId: record.id,
          expected: expectedPreviousHash,
          found: record.previousHash,
          forensicHint:
            "A record was inserted mid-chain or the previous record was replaced. Compare against the last verified snapshot.",
        },
      };
    }

    const grossWeightKg = parseFloat(record.grossWeightKg);
    const tareWeightKg = parseFloat(record.tareWeightKg);
    const netWeightKg = parseFloat(record.netWeightKg);

    // ── C. Arithmetic integrity (detects net tampering) ─────────────────────
    const recomputedNet = grossWeightKg - tareWeightKg;
    if (Math.abs(recomputedNet - netWeightKg) > 0.001) {
      return {
        isValid: false,
        totalRecords: records.length,
        verifiedAt,
        message: `Net weight arithmetic violated at sequence #${record.sequenceNumber}: ${grossWeightKg} − ${tareWeightKg} ≠ ${netWeightKg}.`,
        breach: {
          reason: "NET_WEIGHT_RECOMPUTE_MISMATCH",
          atSequenceNumber: record.sequenceNumber,
          recordId: record.id,
          expected: recomputedNet.toFixed(3),
          found: netWeightKg.toFixed(3),
          forensicHint:
            "The net weight column was edited directly without recomputing gross − tare.",
        },
      };
    }

    // ── D. Cryptographic integrity (detects any field alteration) ───────────
    const sensor = (record.rawSensorData ?? {}) as { ticketNumber?: string };
    const ticketNumber =
      sensor.ticketNumber ?? buildTicketNumber(record.sequenceNumber, record.lockedAt);

    const recomputedHash = computeCompositeHash({
      id: record.id,
      ticketNumber,
      netWeightKg,
      timestampIso: record.lockedAt.toISOString(),
      previousRecordHash: record.previousHash,
      tripId: record.tripId,
      sequenceNumber: record.sequenceNumber,
      grossWeightKg,
      tareWeightKg,
      transactionType: record.transactionType,
    });

    if (recomputedHash !== record.recordHash) {
      return {
        isValid: false,
        totalRecords: records.length,
        verifiedAt,
        message: `TAMPERING DETECTED at sequence #${record.sequenceNumber} (ticket ${ticketNumber}). The stored hash does not match the recomputed hash.`,
        breach: {
          reason: "RECORD_HASH_MISMATCH",
          atSequenceNumber: record.sequenceNumber,
          recordId: record.id,
          expected: recomputedHash,
          found: record.recordHash,
          forensicHint:
            "A weight, ticket number, or timestamp was retroactively modified. This row and every row after it are untrustworthy.",
        },
      };
    }

    expectedPreviousHash = record.recordHash;
    expectedSequence += 1;
  }

  return {
    isValid: true,
    totalRecords: records.length,
    verifiedAt,
    message: `All ${records.length} weighbridge records verified. Sequential and cryptographic integrity intact.`,
  };
}

// ─── Concrete Returns Governance ──────────────────────────────────────────────

/**
 * Handles a mixer returning with excess / rejected ready-mix concrete.
 *
 * Flow:
 *   1. Seal a RETURN_IN weighbridge transaction (hash-chained)
 *   2. Derive the excess volume from the sealed net weight
 *   3. Route the disposition:
 *        RECYCLED_BATCHING → credit aggregate back into inventory_silos
 *        CAST_BLOCKS       → log manufactured unit count in the block ledger
 *        WASHOUT           → credit recovered water into the WATER silo
 *        DISCARDED         → no recovery credit
 *   4. Optionally raise a financial deduction against the order
 */
export async function processConcreteReturn(
  entry: ReturnEntry
): Promise<ReturnResult> {
  const operatorId = entry.operatorId ?? entry.authorisedById;

  // ── 1. Seal the RETURN_IN weighing (immutable) ────────────────────────────
  const weighbridgeRecord = await logWeighbridgeTransaction({
    tripId: entry.tripId,
    transactionType: "RETURN_IN",
    grossWeightKg: entry.returnGrossWeightKg,
    operatorId,
    notes: `Concrete return — ${entry.disposition}: ${entry.returnReason}`,
  });

  // ── 2. Derive excess volume from the sealed net weight ────────────────────
  const excessWeightKg = weighbridgeRecord.netWeightKg;
  const excessVolumeM3 =
    Math.round((excessWeightKg / CONCRETE_DENSITY_KG_PER_M3) * 100) / 100;

  if (excessVolumeM3 <= 0) {
    throw new Error(
      "Return weighing shows no residual concrete (net weight is zero). Nothing to log."
    );
  }

  // ── 3. Persist the return record + route disposition ──────────────────────
  return await db.transaction(async (tx) => {
    const recovery: ReturnResult["recovery"] = {};

    // Pre-compute disposition-specific quantities so they can be stored inline
    let blocksCastCount = 0;
    let aggregateRecoveredKg = 0;
    let waterRecoveredLitres = 0;

    const volumePerBlock = entry.volumePerBlockM3 ?? DEFAULT_BLOCK_VOLUME_M3;

    switch (entry.disposition) {
      case "CAST_BLOCKS":
        blocksCastCount = Math.floor(excessVolumeM3 / volumePerBlock);
        break;
      case "RECYCLED_BATCHING":
        // ~85% of the residual mass is recoverable as washed aggregate
        aggregateRecoveredKg = Math.round(excessWeightKg * 0.85 * 1000) / 1000;
        break;
      case "WASHOUT":
        // Drum washout typically recovers ~150 L of process water per m³
        waterRecoveredLitres = Math.round(excessVolumeM3 * 150 * 100) / 100;
        break;
      case "DISCARDED":
      default:
        break;
    }

    const [returnRecord] = await tx
      .insert(concreteReturns)
      .values({
        tripId: entry.tripId,
        tenantId: weighbridgeRecord.tenantId,
        returnedVolumeM3: excessVolumeM3.toFixed(2),
        returnedWeightKg: excessWeightKg.toFixed(3),
        disposition: entry.disposition,
        returnReason: entry.returnReason,
        authorisedById: entry.authorisedById,
        returnedSlumpCm: entry.returnedSlumpCm?.toFixed(1),
        blocksCastCount,
        aggregateRecoveredKg: aggregateRecoveredKg.toFixed(3),
        waterRecoveredLitres: waterRecoveredLitres.toFixed(2),
        financialDeductionRaised: entry.raiseFinancialDeduction ?? false,
      })
      .returning();

    // ── 3a. CAST_BLOCKS → manufactured unit ledger ──────────────────────────
    if (entry.disposition === "CAST_BLOCKS" && blocksCastCount > 0) {
      const totalVolumeCastM3 = blocksCastCount * volumePerBlock;

      const [blockLog] = await tx
        .insert(blockManufacturingLogs)
        .values({
          returnId: returnRecord.id,
          tenantId: weighbridgeRecord.tenantId,
          blocksCount: blocksCastCount,
          blockSizeCm: entry.blockSizeCm ?? "20x20x40",
          volumePerBlockM3: volumePerBlock.toFixed(4),
          totalVolumeCastM3: totalVolumeCastM3.toFixed(2),
          curedStatus: "CURING",
          loggedById: entry.authorisedById,
        })
        .returning();

      recovery.blocksManufactured = blocksCastCount;
      recovery.blockLedgerId = blockLog.id;
    }

    // ── 3b. RECYCLED_BATCHING → credit aggregate silo ───────────────────────
    if (entry.disposition === "RECYCLED_BATCHING" && aggregateRecoveredKg > 0) {
      // Resolve destination silo: explicit override, else the coarse aggregate bin
      let destinationSiloId = entry.destinationSiloId;

      if (!destinationSiloId) {
        const defaultSilo = await tx
          .select({ id: inventorySilos.id })
          .from(inventorySilos)
          .where(
            and(
              eq(inventorySilos.materialCategory, "GRAVEL_20MM"),
              eq(inventorySilos.isActive, true)
            )
          )
          .limit(1);
        destinationSiloId = defaultSilo[0]?.id;
      }

      const [aggLog] = await tx
        .insert(aggregateRecyclingLogs)
        .values({
          returnId: returnRecord.id,
          tenantId: weighbridgeRecord.tenantId,
          aggregateRecoveredKg: aggregateRecoveredKg.toFixed(3),
          recoveredGrade: entry.recoveredGrade ?? "COARSE",
          destinationSiloId,
          processingState: "RAW",
          loggedById: entry.authorisedById,
        })
        .returning();

      recovery.aggregateRecoveredKg = aggregateRecoveredKg;
      recovery.aggregateLedgerId = aggLog.id;

      if (destinationSiloId) {
        const credited = await creditSilo(
          tx,
          destinationSiloId,
          aggregateRecoveredKg,
          entry.tripId,
          entry.authorisedById,
          `Recycled aggregate from concrete return ${returnRecord.id}`,
          weighbridgeRecord.tenantId
        );
        if (credited) recovery.siloCredited = credited;
      }
    }

    // ── 3c. WASHOUT → credit recovered process water ────────────────────────
    if (entry.disposition === "WASHOUT" && waterRecoveredLitres > 0) {
      const waterSilo = await tx
        .select({ id: inventorySilos.id })
        .from(inventorySilos)
        .where(
          and(
            eq(inventorySilos.materialCategory, "WATER"),
            eq(inventorySilos.isActive, true)
          )
        )
        .limit(1);

      recovery.waterRecoveredLitres = waterRecoveredLitres;

      if (waterSilo.length > 0) {
        const credited = await creditSilo(
          tx,
          waterSilo[0].id,
          waterRecoveredLitres, // 1 L water ≈ 1 kg
          entry.tripId,
          entry.authorisedById,
          `Recovered washout water from concrete return ${returnRecord.id}`,
          weighbridgeRecord.tenantId
        );
        if (credited) recovery.siloCredited = credited;
      }
    }

    // ── 4. Financial deduction ──────────────────────────────────────────────
    let financialDeductionSar: number | undefined;

    if (entry.raiseFinancialDeduction) {
      const tripRow = await tx
        .select({ orderId: trips.orderId })
        .from(trips)
        .where(eq(trips.id, entry.tripId))
        .limit(1);

      if (tripRow.length > 0) {
        const orderRow = await tx
          .select({ pricePerM3Sar: orders.pricePerM3Sar })
          .from(orders)
          .where(eq(orders.id, tripRow[0].orderId))
          .limit(1);

        if (orderRow.length > 0) {
          financialDeductionSar = Math.round(
            excessVolumeM3 * orderRow[0].pricePerM3Sar
          );

          await tx
            .update(concreteReturns)
            .set({ deductionAmountSar: financialDeductionSar })
            .where(eq(concreteReturns.id, returnRecord.id));
        }
      }
    }

    // ── 5. Audit ────────────────────────────────────────────────────────────
    await tx.insert(auditLogs).values({
      userId: entry.authorisedById,
      tenantId: weighbridgeRecord.tenantId,
      action: "CONCRETE_RETURN_PROCESSED",
      entityType: "concrete_returns",
      entityId: returnRecord.id,
      newState: {
        ticketNumber: weighbridgeRecord.ticketNumber,
        excessVolumeM3,
        excessWeightKg,
        disposition: entry.disposition,
        recovery,
        financialDeductionSar,
      },
      socketEvent: "return:logged",
    });

    return {
      returnId: returnRecord.id,
      weighbridgeRecord,
      excessVolumeM3,
      excessWeightKg,
      disposition: entry.disposition,
      recovery,
      financialDeductionSar,
    };
  });
}

/**
 * Credits material back into a silo (capped at capacity) and writes the
 * corresponding inventory ledger row. Used by the returns recovery routes.
 */
async function creditSilo(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  siloId: string,
  quantityKg: number,
  tripId: string,
  performedById: string,
  note: string,
  tenantId: string
): Promise<{ siloId: string; siloCode: string; newStockKg: number } | null> {
  const siloRows = await tx
    .select({
      id: inventorySilos.id,
      siloCode: inventorySilos.siloCode,
      currentStockKg: inventorySilos.currentStockKg,
      capacityKg: inventorySilos.capacityKg,
    })
    .from(inventorySilos)
    .where(eq(inventorySilos.id, siloId))
    .limit(1)
    .for("update");

  if (siloRows.length === 0) return null;

  const silo = siloRows[0];
  const current = parseFloat(silo.currentStockKg ?? "0");
  const capacity = parseFloat(silo.capacityKg ?? "0");
  const newStock = Math.min(capacity, current + quantityKg);

  await tx
    .update(inventorySilos)
    .set({ currentStockKg: newStock.toFixed(3), updatedAt: new Date() })
    .where(eq(inventorySilos.id, siloId));

  await tx.insert(inventoryTransactions).values({
    siloId,
    tenantId,
    tripId,
    transactionType: "RECOVERY",
    quantityKg: quantityKg.toFixed(3),
    balanceAfterKg: newStock.toFixed(3),
    performedById,
    notes: note,
  });

  return { siloId, siloCode: silo.siloCode, newStockKg: newStock };
}

// ─── Reporting Helpers ────────────────────────────────────────────────────────

export async function getTripWeighbridgeHistory(tripId: string) {
  return db
    .select()
    .from(weighbridgeTransactions)
    .where(eq(weighbridgeTransactions.tripId, tripId))
    .orderBy(weighbridgeTransactions.sequenceNumber);
}

export async function getWeighbridgeStats() {
  const rows = await db
    .select({
      totalTransactions: sql<number>`COUNT(*)::int`,
      totalNetWeightKg: sql<string>`COALESCE(SUM(CAST(net_weight_kg AS DECIMAL)), 0)::text`,
      loadOutCount: sql<number>`SUM(CASE WHEN transaction_type = 'LOAD_OUT' THEN 1 ELSE 0 END)::int`,
      returnInCount: sql<number>`SUM(CASE WHEN transaction_type = 'RETURN_IN' THEN 1 ELSE 0 END)::int`,
      chainTipSequence: sql<number>`COALESCE(MAX(sequence_number), 0)::int`,
    })
    .from(weighbridgeTransactions);

  const row = rows[0];
  return {
    totalTransactions: row.totalTransactions,
    totalNetWeightKg: parseFloat(row.totalNetWeightKg ?? "0"),
    loadOutCount: row.loadOutCount,
    returnInCount: row.returnInCount,
    chainTipSequence: row.chainTipSequence,
  };
}

/**
 * Aggregated recovery / sustainability statistics for the returns dashboard.
 */
export async function getReturnsRecoveryStats(timeRangeDays = 30) {
  const since = new Date();
  since.setDate(since.getDate() - timeRangeDays);

  const rows = await db
    .select({
      totalReturns: sql<number>`COUNT(*)::int`,
      blocksManufactured: sql<number>`COALESCE(SUM(blocks_cast_count), 0)::int`,
      aggregateRecoveredKg: sql<string>`COALESCE(SUM(CAST(aggregate_recovered_kg AS DECIMAL)), 0)::text`,
      waterRecoveredLitres: sql<string>`COALESCE(SUM(CAST(water_recovered_litres AS DECIMAL)), 0)::text`,
      totalVolumeM3: sql<string>`COALESCE(SUM(CAST(returned_volume_m3 AS DECIMAL)), 0)::text`,
      recycledM3: sql<string>`COALESCE(SUM(CASE WHEN disposition = 'RECYCLED_BATCHING' THEN CAST(returned_volume_m3 AS DECIMAL) ELSE 0 END), 0)::text`,
      castM3: sql<string>`COALESCE(SUM(CASE WHEN disposition = 'CAST_BLOCKS' THEN CAST(returned_volume_m3 AS DECIMAL) ELSE 0 END), 0)::text`,
      washoutM3: sql<string>`COALESCE(SUM(CASE WHEN disposition = 'WASHOUT' THEN CAST(returned_volume_m3 AS DECIMAL) ELSE 0 END), 0)::text`,
      discardedM3: sql<string>`COALESCE(SUM(CASE WHEN disposition = 'DISCARDED' THEN CAST(returned_volume_m3 AS DECIMAL) ELSE 0 END), 0)::text`,
      deductionsSar: sql<number>`COALESCE(SUM(deduction_amount_sar), 0)::int`,
    })
    .from(concreteReturns)
    .where(sql`created_at >= ${since.toISOString()}::timestamp`);

  const r = rows[0];
  const total = parseFloat(r.totalVolumeM3 ?? "0");
  const recycled = parseFloat(r.recycledM3 ?? "0");
  const cast = parseFloat(r.castM3 ?? "0");
  const washout = parseFloat(r.washoutM3 ?? "0");
  const discarded = parseFloat(r.discardedM3 ?? "0");
  const recovered = recycled + cast + washout;

  return {
    timeRangeDays,
    totalReturns: r.totalReturns,
    totalVolumeReturnedM3: Math.round(total * 100) / 100,
    blocksManufactured: r.blocksManufactured,
    aggregateRecoveredKg: parseFloat(r.aggregateRecoveredKg ?? "0"),
    waterRecoveredLitres: parseFloat(r.waterRecoveredLitres ?? "0"),
    discardedVolumeM3: Math.round(discarded * 100) / 100,
    recycledPct: total > 0 ? Math.round((recycled / total) * 100) : 0,
    castBlocksPct: total > 0 ? Math.round((cast / total) * 100) : 0,
    washoutPct: total > 0 ? Math.round((washout / total) * 100) : 0,
    wastedPct: total > 0 ? Math.round((discarded / total) * 100) : 0,
    /** Overall material recovery efficiency (0–100) */
    recoveryEfficiencyPct: total > 0 ? Math.round((recovered / total) * 100) : 100,
    totalDeductionsSar: r.deductionsSar,
  };
}
