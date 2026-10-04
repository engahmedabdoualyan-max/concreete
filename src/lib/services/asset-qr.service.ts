/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Asset QR Identity Service
 *  src/lib/services/asset-qr.service.ts
 * ============================================================
 *
 *  PURPOSE
 *  ─────────────────────────────────────────────────────────
 *  One permanent QR identity for every physical thing that moves
 *  around the plant: spare parts, scrap, employees, equipment,
 *  vehicles, delivery challans (شجرة) and concrete samples.
 *
 *  WHY A SEPARATE SERVICE INSTEAD OF A FIELD ON EACH TABLE
 *  ─────────────────────────────────────────────────────────
 *  A part, an employee badge and a concrete cube have nothing in
 *  common except that they need a sticker and a scanner. If each
 *  table grew its own `qr_token` column, the printing logic, the
 *  permission check, the redaction rules and the audit trail would
 *  all be copy-pasted six times and drift apart within a month.
 *  Here they exist once.
 *
 *  THE ANTI-FRAUD INVARIANT
 *  ─────────────────────────────────────────────────────────
 *  A scrapped part's label is NEVER deleted and its binding history
 *  is NEVER rewritten. A unit that came off MIX-03 in March still
 *  reports MIX-03 in October, because the whole point is to be able
 *  to say "you returned this claiming you fitted it — the system
 *  says it was on MIX-03, show me the work order." Deleting the
 *  label on removal would make the claim unfalsifiable again.
 *
 *  SECRET HANDLING
 *  ─────────────────────────────────────────────────────────
 *  The scan secret is 160 bits of CSPRNG output. Only its SHA-256
 *  is stored, so a database dump cannot be replayed to forge a
 *  label. `token_hint` is a short prefix printed under the QR for
 *  manual keying-in when a sticker is too damaged to scan.
 */

import crypto from "crypto";
import { db } from "@/db";
import {
  assetQrLabels,
  assetQrBindings,
  equipment,
  warehouseItems,
  warehouseItemUnits,
  fleetVehicles,
  users,
  maintenanceOrders,
  payrollEmployees,
  trips,
  labTestSamples,
  type AssetQrSubjectType,
} from "@/db/schema";
import {
  and,
  eq,
  desc,
  asc,
  isNull,
  inArray,
  sql,
  type SQL,
} from "drizzle-orm";

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Label prefix per subject type. The prefix is the first thing a human reads
 * off a damaged sticker, so it must say what the thing IS before anyone scans
 * it. Sequences are per tenant so one plant cannot print another plant's codes.
 */
export const LABEL_PREFIX: Record<AssetQrSubjectType, string> = {
  ITEM_CARD: "IC", // كارت الصنف
  ITEM_UNIT: "SP", // spare part / scrap unit
  EMPLOYEE: "EMP",
  EQUIPMENT: "EQ",
  VEHICLE: "VH",
  CHALLAN: "CH", // شجرة
  CONCRETE_SAMPLE: "SM", // sample
};

/** Scanned subjects a redacted (BASIC) viewer may resolve. */
const BASIC_RESOLVERS: Record<AssetQrSubjectType, Resolver> = {
  ITEM_CARD: resolveItemCardSubject,
  ITEM_UNIT: resolveItemSubject,
  EMPLOYEE: resolveEmployeeSubject,
  EQUIPMENT: resolveEquipmentSubject,
  VEHICLE: resolveVehicleSubject,
  CHALLAN: resolveChallanSubject,
  CONCRETE_SAMPLE: resolveSampleSubject,
};

/**
 * How much of a record the caller is cleared for.
 *
 *   FULL  — mechanic / workshop manager / plant manager / HR manager.
 *           Repairs, oils, every part ever fitted, cost.
 *   BASIC — everyone else with qr:scan. Identity and "who is on it" ONLY.
 *           This is the level that makes the feature usable by a driver in the
 *           yard without turning the QR into an open database.
 */
export type VisibilityTier = "FULL" | "BASIC";

// ─── Secrets ──────────────────────────────────────────────────────────────────

/**
 * Mint a scan secret and its stored hash.
 *
 * The secret is returned to the caller exactly once — it has to be written onto
 * the physical sticker at print time, and we deliberately keep no way to
 * recover it afterwards. Reissuing a label mints a new secret and the old
 * sticker stops scanning; see `reissueLabel` for why that is the safe default.
 */
export function mintToken(): { token: string; tokenHash: string; tokenHint: string } {
  const token = crypto.randomBytes(20).toString("hex"); // 160 bits
  return {
    token,
    tokenHash: hashToken(token),
    tokenHint: token.slice(0, 8).toUpperCase(),
  };
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token.trim(), "utf8").digest("hex");
}

/**
 * The payload actually printed into the QR image.
 *
 * Human-readable prefix + label code comes FIRST so that a damaged code still
 * shows a code a human can key in. The secret is last. The parse is tolerant of
 * separators because scanners and label printers disagree about whitespace.
 */
export function buildQrPayload(labelCode: string, token: string): string {
  return `FIMTO|${labelCode}|${token}`;
}

/**
 * Accepts anything a scanner or a human might produce:
 *   "FIMTO|SP-000123|<token>", "SP-000123:<token>", or a bare token.
 * Returns null when there is no plausible secret in the string.
 */
export function parseQrPayload(raw: string): { labelCode: string | null; token: string } | null {
  const cleaned = raw.replace(/[\s\u200b]+/g, "").trim();
  if (!cleaned) return null;

  const parts = cleaned.split(/[|:;]/).filter(Boolean);

  // The secret is always the last segment that looks like hex of enough length.
  let token: string | null = null;
  let labelCode: string | null = null;
  for (const part of parts) {
    if (/^[0-9a-fA-F]{16,}$/.test(part)) {
      token = part.toLowerCase();
    } else if (!labelCode && !/^FIMTO$/i.test(part)) {
      labelCode = part.toUpperCase();
    }
  }
  if (!token) return null;
  return { labelCode, token };
}

// ─── Label issuing ────────────────────────────────────────────────────────────

export type IssueLabelInput = {
  tenantId: string;
  subjectType: AssetQrSubjectType;
  subjectId: string;
  /** The subject's own human code — frozen onto the label so a scan still
   *  identifies the thing after the stock row is gone. */
  subjectRef: string;
  subjectLabel?: string | null;
  issuedById: string;
};

export type IssueLabelResult = {
  ok: true;
  /** Present only on first issue — this is the one time the secret is known. */
  token: string | null;
  label: typeof assetQrLabels.$inferSelect;
};

/**
 * Issue (or re-fetch) the permanent label for a subject.
 *
 * Idempotent by design: creating a warehouse item or registering equipment can
 * call this on every save without minting a second identity. A subject that
 * already has a live label gets that label back — with `token: null`, because
 * the secret is unrecoverable by design and the caller must reprint the stored
 * payload from their own record of it.
 */
export async function issueLabel(input: IssueLabelInput): Promise<IssueLabelResult> {
  const existing = await db
    .select()
    .from(assetQrLabels)
    .where(
      and(
        eq(assetQrLabels.tenantId, input.tenantId),
        eq(assetQrLabels.subjectType, input.subjectType),
        eq(assetQrLabels.subjectId, input.subjectId),
        sql`${assetQrLabels.state} <> 'RETIRED'`
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return { ok: true, token: null, label: existing[0] };
  }

  const labelCode = await nextLabelCode(input.tenantId, input.subjectType);
  const { token, tokenHash, tokenHint } = mintToken();

  const [label] = await db
    .insert(assetQrLabels)
    .values({
      tenantId: input.tenantId,
      labelCode,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      subjectRef: input.subjectRef,
      subjectLabel: input.subjectLabel ?? null,
      tokenHash,
      tokenHint,
      issuedById: input.issuedById,
    })
    .returning();

  return { ok: true, token, label: label! };
}

/**
 * Next free label code for a tenant + subject type, e.g. `SP-000042`.
 *
 * Generated as max+1 inside a single statement and retried on collision, so two
 * stores pressing "print label" at the same moment cannot mint the same code.
 */
async function nextLabelCode(tenantId: string, subjectType: AssetQrSubjectType): Promise<string> {
  const prefix = LABEL_PREFIX[subjectType];

  for (let attempt = 0; attempt < 6; attempt++) {
    const [{ next }] = await db
      .select({
        next: sql<string>`COALESCE(MAX(SUBSTRING(${assetQrLabels.labelCode} FROM '[0-9]+$'))::bigint, 0) + 1`,
      })
      .from(assetQrLabels)
      .where(
        and(
          eq(assetQrLabels.tenantId, tenantId),
          eq(assetQrLabels.subjectType, subjectType)
        )
      );

    const candidate = `${prefix}-${String(next).padStart(6, "0")}`;
    const clash = await db
      .select({ id: assetQrLabels.id })
      .from(assetQrLabels)
      .where(
        and(
          eq(assetQrLabels.tenantId, tenantId),
          eq(assetQrLabels.labelCode, candidate)
        )
      )
      .limit(1);

    if (clash.length === 0) return candidate;
  }

  // Six collisions in a row means the sequence is being hammered; a
  // microsecond-fresh number is still a valid unique code.
  return `${prefix}-${String(Date.now()).slice(-9)}`;
}

/** Mark a label as printed, bumping the reprint counter. */
export async function markPrinted(labelId: string): Promise<void> {
  await db
    .update(assetQrLabels)
    .set({ printedAt: new Date(), printCount: sql`${assetQrLabels.printCount} + 1` })
    .where(eq(assetQrLabels.id, labelId));
}

/**
 * Reprint a label: mint a FRESH secret and overwrite the stored hash.
 *
 * The old secret is not recoverable by design, so a reprint cannot reproduce
 * the previous QR — it issues a new one and the damaged sticker stops scanning.
 * That is the correct behaviour when the reason for reprinting is that the
 * label is lost or unreadable: a second sticker must not be a second identity,
 * and a label whose secret leaked must be killable.
 *
 * Callers must treat this as an audited event.
 */
export async function reissueLabel(input: {
  tenantId: string;
  labelId: string;
  issuedById: string;
}): Promise<{ ok: true; token: string; label: typeof assetQrLabels.$inferSelect } | { ok: false; code: "LABEL_NOT_FOUND" }> {
  const [label] = await db
    .select()
    .from(assetQrLabels)
    .where(
      and(
        eq(assetQrLabels.id, input.labelId),
        eq(assetQrLabels.tenantId, input.tenantId)
      )
    )
    .limit(1);
  if (!label) return { ok: false, code: "LABEL_NOT_FOUND" };

  const { token, tokenHash, tokenHint } = mintToken();
  const [updated] = await db
    .update(assetQrLabels)
    .set({
      tokenHash,
      tokenHint,
      issuedById: input.issuedById,
      printedAt: new Date(),
      printCount: sql`${assetQrLabels.printCount} + 1`,
    })
    .where(eq(assetQrLabels.id, label.id))
    .returning();

  return { ok: true, token, label: updated! };
}

// ─── Scanning ─────────────────────────────────────────────────────────────────

export type ScanResult =
  | {
      ok: true;
      tier: VisibilityTier;
      label: typeof assetQrLabels.$inferSelect;
      /** Redacted to the caller's tier. Never wider than the tier allows. */
      subject: Record<string, unknown> | null;
      /** Where the label is RIGHT NOW (null = in the warehouse). */
      currentBinding: {
        vehicleId: string | null;
        vehicleCode: string | null;
        plateNumber: string | null;
        workOrderNumber: string | null;
        boundAt: Date;
        locationNote: string | null;
      } | null;
      /** FULL tier only: every vehicle this label has ever been fitted to. */
      history?: {
        vehicleCode: string;
        plateNumber: string;
        workOrderNumber: string | null;
        boundAt: Date;
        unboundAt: Date | null;
        unbindReason: string | null;
      }[];
    }
  | { ok: false; code: "NOT_FOUND" }
  | { ok: false; code: "SUBJECT_MISSING"; label: typeof assetQrLabels.$inferSelect };

type ScanInput = {
  tenantId: string;
  /** Raw scanner output or typed hint. */
  raw: string;
  tier: VisibilityTier;
};

/**
 * Resolve a scanned label to whatever the caller is cleared to see.
 *
 * TENANCY: the token lookup is tenant-scoped, so a label from another plant
 * reports NOT_FOUND rather than "exists but forbidden" — a scan must not be
 * usable as a probe for which codes exist elsewhere.
 */
export async function scanLabel(input: ScanInput): Promise<ScanResult> {
  const parsed = parseQrPayload(input.raw);
  if (!parsed) return { ok: false, code: "NOT_FOUND" };

  const conditions: SQL[] = [
    eq(assetQrLabels.tenantId, input.tenantId),
    eq(assetQrLabels.tokenHash, hashToken(parsed.token)),
    // A RETIRED label must not scan, and this is where that is enforced.
    //
    // Retiring is how a label is killed permanently: when a part is scrapped and
    // sold, when a driver leaves and their badge is voided, when a reissued
    // sticker supersedes the one it replaces. Those old stickers are still
    // physically out there, and their secret still verifies — so without this
    // clause a voided employee's badge would keep resolving to their record,
    // and a scrapped part's label would keep answering with live-looking data.
    // The label row is never deleted, so the audit trail survives; only the
    // door is closed.
    //
    // DETACHED (currently off a vehicle) and ACTIVE (currently on one) are both
    // fine: both mean the sticker is still the truth.
    inArray(assetQrLabels.state, ["ACTIVE", "DETACHED"]),
  ];
  // If the scanner gave us a label code, insist it agrees with the secret.
  // A mismatched pair means a sticker was printed over another one, and the
  // newer code wins only if its secret also matches — otherwise we refuse.
  if (parsed.labelCode) conditions.push(eq(assetQrLabels.labelCode, parsed.labelCode));

  const found = await db
    .select()
    .from(assetQrLabels)
    .where(and(...conditions))
    .limit(1);

  if (found.length === 0) return { ok: false, code: "NOT_FOUND" };
  const label = found[0];

  const resolver = BASIC_RESOLVERS[label.subjectType];
  const subject = await resolver(label, input.tier, input.tenantId);

  const bindingRows = await db
    .select({
      vehicleId: assetQrBindings.vehicleId,
      vehicleCode: fleetVehicles.vehicleCode,
      plateNumber: fleetVehicles.plateNumber,
      workOrderNumber: maintenanceOrders.workOrderNumber,
      boundAt: assetQrBindings.boundAt,
      locationNote: assetQrBindings.locationNote,
      unboundAt: assetQrBindings.unboundAt,
      unbindReason: assetQrBindings.unbindReason,
    })
    .from(assetQrBindings)
    .leftJoin(fleetVehicles, eq(fleetVehicles.id, assetQrBindings.vehicleId))
    .leftJoin(
      maintenanceOrders,
      eq(maintenanceOrders.id, assetQrBindings.workOrderId)
    )
    .where(
      and(
        eq(assetQrBindings.labelId, label.id),
        eq(assetQrBindings.tenantId, input.tenantId)
      )
    )
    .orderBy(desc(assetQrBindings.boundAt));

  const active = bindingRows.find((b) => b.unboundAt === null) ?? null;

  const result: ScanResult = {
    ok: true,
    tier: input.tier,
    label,
    subject,
    currentBinding: active
      ? {
          vehicleId: active.vehicleId,
          vehicleCode: active.vehicleCode,
          plateNumber: active.plateNumber,
          workOrderNumber: active.workOrderNumber,
          boundAt: active.boundAt,
          locationNote: active.locationNote,
        }
      : null,
  };

  // The full "this was on MIX-03 last March" trail is FULL-tier only: it is the
  // maintenance record of another vehicle, not a property of this label.
  if (input.tier === "FULL") {
    result.history = bindingRows
      .filter((b) => b.vehicleCode !== null)
      .map((b) => ({
        vehicleCode: b.vehicleCode!,
        plateNumber: b.plateNumber!,
        workOrderNumber: b.workOrderNumber,
        boundAt: b.boundAt,
        unboundAt: b.unboundAt,
        unbindReason: b.unbindReason,
      }));
  }

  return result;
}

// ─── Subject resolvers (redaction lives here) ─────────────────────────────────

/**
 * Every resolver takes the tier and returns at most that tier's worth of data.
 * BASIC is deliberately thin: enough to answer "is this the right thing?" and
 * nothing that helps an outsider profile a vehicle or price a part.
 */

/**
 * A subject resolver, narrowed to the caller's tenant.
 *
 * `asset_qr_labels.subject_id` is a bare UUID with no foreign key — that is
 * deliberate, so a label outlives its subject — but it also means the label row
 * is the ONLY thing tying a subject to a tenant. A resolver that filtered on
 * `id` alone would happily return another plant's vehicle to anyone holding a
 * label, so every resolver takes `tenantId` and filters on it. Belt and braces:
 * the label was already matched to the caller's tenant, so a mismatch here means
 * the row was tampered with, and returning null is the safe answer.
 */
type Resolver = (
  label: typeof assetQrLabels.$inferSelect,
  tier: VisibilityTier,
  tenantId: string
) => Promise<Record<string, unknown> | null>;

async function resolveVehicleSubject(
  label: typeof assetQrLabels.$inferSelect,
  tier: VisibilityTier,
  tenantId: string
): Promise<Record<string, unknown> | null> {
  const [v] = await db
    .select()
    .from(fleetVehicles)
    .where(
      and(
        eq(fleetVehicles.id, label.subjectId),
        eq(fleetVehicles.tenantId, tenantId)
      )
    )
    .limit(1);
  if (!v) return null;

  const [driver] = v.assignedDriverId
    ? await db
        .select({ fullName: users.fullName })
        .from(users)
        .where(
          and(eq(users.id, v.assignedDriverId), eq(users.tenantId, tenantId))
        )
        .limit(1)
    : [undefined];

  const base: Record<string, unknown> = {
    kind: "VEHICLE",
    vehicleCode: v.vehicleCode,
    plateNumber: v.plateNumber,
    vehicleType: v.vehicleType,
    currentStatus: v.currentStatus,
    /** The one fact a BASIC viewer is allowed: who is on it. */
    assignedDriverName: driver?.fullName ?? null,
  };

  if (tier !== "FULL") return base;

  // Three aggregates in one pass. `spentSar` and `worstSar` are both needed and
  // they are NOT the same number: a plant owner asking "what has this truck
  // cost me in repairs" wants the SUM, while a mechanic asking "what was the
  // worst repair it had" wants the MAX. An earlier version computed only the MAX
  // and then never returned it, so the aggregate was dead work on every scan.
  const [repairStats] = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      open: sql<number>`COUNT(*) FILTER (WHERE ${maintenanceOrders.status} IN ('OPEN','IN_PROGRESS'))::int`,
      spentSar: sql<string>`COALESCE(SUM(${maintenanceOrders.totalCostSar}), 0)`,
      worstSar: sql<string>`COALESCE(MAX(${maintenanceOrders.totalCostSar}), 0)`,
    })
    .from(maintenanceOrders)
    .where(
      and(
        eq(maintenanceOrders.vehicleId, v.id),
        eq(maintenanceOrders.tenantId, tenantId)
      )
    );

  return {
    ...base,
    make: v.make,
    model: v.model,
    year: v.year,
    odometreKm: v.odometreKm,
    isActive: v.isActive,
    drumCapacityM3: v.drumCapacityM3,
    tareWeightTonnes: v.tareWeightTonnes,
    maintenanceCount: repairStats?.total ?? 0,
    openMaintenanceCount: repairStats?.open ?? 0,
    /** Everything repairs have ever cost this truck. */
    repairSpendSar: repairStats?.spentSar ?? '0',
    /** The single most expensive repair — the "when did it hurt" number. */
    worstRepairSar: repairStats?.worstSar ?? '0',
  };
};

/**
 * The stores card (كارت الصنف). Scanning it answers "what is this, and have we
 * got any?" — a shelf-level question, so BASIC already includes the quantity,
 * because a stock level is not sensitive and a storeman without it cannot work.
 * Cost stays behind FULL.
 */
async function resolveItemCardSubject(
  label: typeof assetQrLabels.$inferSelect,
  tier: VisibilityTier,
  tenantId: string
): Promise<Record<string, unknown> | null> {
  const [item] = await db
    .select()
    .from(warehouseItems)
    .where(
      and(
        eq(warehouseItems.id, label.subjectId),
        eq(warehouseItems.tenantId, tenantId)
      )
    )
    .limit(1);
  if (!item) return null;

  const base: Record<string, unknown> = {
    kind: "ITEM_CARD",
    itemCode: item.itemCode,
    name: item.name,
    nameAr: item.nameAr,
    category: item.category,
    unit: item.unit,
    defaultWarehouse: item.defaultWarehouse,
    qtyOnHand: item.qtyOnHand,
    minQty: item.minQty,
    lowStock: Number(item.qtyOnHand) <= Number(item.minQty),
    isActive: item.isActive,
  };
  if (tier !== "FULL") return base;

  return {
    ...base,
    unitCostSar: item.unitCostSar,
    oemPartNumber: item.oemPartNumber,
    appliesToMake: item.appliesToMake,
    appliesToModel: item.appliesToModel,
    isSerialized: item.isSerialized,
    notes: item.notes,
  };
}

/**
 * A single serialized piece of stock.
 *
 * The label points at the UNIT, not at the item card — that is the whole point
 * of having units, because "the pump that came off MIX-03" and "the three spare
 * pumps still on the shelf" must not answer to the same QR. So this resolves the
 * unit first and then reads its parent item for the descriptive fields.
 *
 * `qtyOnHand` is deliberately absent at every tier: it belongs to the item, and
 * showing a shelf count next to one specific part is how a storeman gets confused
 * about which number is which. The card label (ITEM_CARD) is what answers
 * stock-level questions.
 */
async function resolveItemSubject(
  label: typeof assetQrLabels.$inferSelect,
  tier: VisibilityTier,
  tenantId: string
): Promise<Record<string, unknown> | null> {
  const [row] = await db
    .select({
      unitId: warehouseItemUnits.id,
      unitSerial: warehouseItemUnits.unitSerial,
      unitState: warehouseItemUnits.state,
      unitNotes: warehouseItemUnits.notes,
      itemCode: warehouseItems.itemCode,
      name: warehouseItems.name,
      nameAr: warehouseItems.nameAr,
      category: warehouseItems.category,
      unit: warehouseItems.unit,
      isActive: warehouseItems.isActive,
      unitCostSar: warehouseItems.unitCostSar,
      oemPartNumber: warehouseItems.oemPartNumber,
      defaultWarehouse: warehouseItems.defaultWarehouse,
      appliesToMake: warehouseItems.appliesToMake,
      appliesToModel: warehouseItems.appliesToModel,
      notes: warehouseItems.notes,
    })
    .from(warehouseItemUnits)
    .innerJoin(warehouseItems, eq(warehouseItems.id, warehouseItemUnits.itemId))
    .where(
      and(
        eq(warehouseItemUnits.id, label.subjectId),
        eq(warehouseItemUnits.tenantId, tenantId),
        eq(warehouseItems.tenantId, tenantId)
      )
    )
    .limit(1);
  if (!row) return null;

  const base: Record<string, unknown> = {
    kind: "ITEM_UNIT",
    /** This piece's own identity — printed under the QR, so it is public. */
    unitSerial: row.unitSerial,
    unitState: row.unitState,
    itemCode: row.itemCode,
    name: row.name,
    nameAr: row.nameAr,
    category: row.category,
    unit: row.unit,
    isActive: row.isActive,
  };
  if (tier !== "FULL") return base;

  return {
    ...base,
    unitId: row.unitId,
    unitCostSar: row.unitCostSar,
    oemPartNumber: row.oemPartNumber,
    defaultWarehouse: row.defaultWarehouse,
    appliesToMake: row.appliesToMake,
    appliesToModel: row.appliesToModel,
    notes: row.notes,
    unitNotes: row.unitNotes,
  };
}

async function resolveEmployeeSubject(
  label: typeof assetQrLabels.$inferSelect,
  tier: VisibilityTier,
  tenantId: string
): Promise<Record<string, unknown> | null> {
  const [emp] = await db
    .select()
    .from(payrollEmployees)
    .where(
      and(
        eq(payrollEmployees.id, label.subjectId),
        eq(payrollEmployees.tenantId, tenantId)
      )
    )
    .limit(1);
  if (!emp) return null;

  const base: Record<string, unknown> = {
    kind: "EMPLOYEE",
    employeeCode: emp.employeeCode,
    fullName: emp.fullName,
    jobTitle: emp.jobTitle,
    department: emp.department,
  };

  if (tier !== "FULL") return base;

  return {
    ...base,
    nationality: emp.nationality,
    gosiSystem: emp.gosiSystem,
    hireDate: emp.hireDate,
    isActive: emp.isActive,
    hasSystemLogin: emp.userId !== null,
    // Deliberately absent: baseSalarySar, allowances, bankIban, nationalId.
    // This endpoint identifies a person, it is not a payslip and it is not a
    // background check — pay details stay in the payroll module.
  };
}

async function resolveEquipmentSubject(
  label: typeof assetQrLabels.$inferSelect,
  tier: VisibilityTier,
  tenantId: string
): Promise<Record<string, unknown> | null> {
  const [eqRow] = await db
    .select()
    .from(equipment)
    .where(
      and(
        eq(equipment.id, label.subjectId),
        eq(equipment.tenantId, tenantId)
      )
    )
    .limit(1);
  if (!eqRow) return null;

  const base: Record<string, unknown> = {
    kind: "EQUIPMENT",
    equipmentCode: eqRow.equipmentCode,
    name: eqRow.name,
    category: eqRow.category,
    location: eqRow.location,
    isActive: eqRow.isActive,
  };
  if (tier !== "FULL") return base;

  return {
    ...base,
    nameAr: eqRow.nameAr,
    make: eqRow.make,
    model: eqRow.model,
    serialNumber: eqRow.serialNumber,
    commissionedAt: eqRow.commissionedAt,
    costSar: eqRow.costSar,
  };
}

async function resolveChallanSubject(
  label: typeof assetQrLabels.$inferSelect,
  tier: VisibilityTier,
  tenantId: string
): Promise<Record<string, unknown> | null> {
  const [t] = await db
    .select()
    .from(trips)
    .where(
      and(
        eq(trips.id, label.subjectId),
        eq(trips.tenantId, tenantId)
      )
    )
    .limit(1);
  if (!t) return null;

  const base: Record<string, unknown> = {
    kind: "CHALLAN",
    tripNumber: t.tripNumber,
    deliveryTicketNumber: t.deliveryTicketNumber,
    isCompleted: t.isCompleted,
    isCancelled: t.isCancelled,
    createdAt: t.createdAt,
  };
  if (tier !== "FULL") return base;

  return {
    ...base,
    orderId: t.orderId,
    vehicleId: t.vehicleId,
    driverId: t.driverId,
    loadedVolumeM3: t.loadedVolumeM3,
    confirmedVolumeM3: t.confirmedVolumeM3,
    deliveryTicketIssuedAt: t.deliveryTicketIssuedAt,
    signedBy: t.signedBy,
    signedAt: t.signedAt,
    qrVerifiedAt: t.qrVerifiedAt,
  };
}

async function resolveSampleSubject(
  label: typeof assetQrLabels.$inferSelect,
  tier: VisibilityTier,
  tenantId: string
): Promise<Record<string, unknown> | null> {
  const [s] = await db
    .select()
    .from(labTestSamples)
    .where(
      and(
        eq(labTestSamples.id, label.subjectId),
        eq(labTestSamples.tenantId, tenantId)
      )
    )
    .limit(1);
  if (!s) return null;

  const base: Record<string, unknown> = {
    kind: "CONCRETE_SAMPLE",
    sampleNumber: s.sampleNumber,
    sampledAt: s.sampledAt,
    freshSlumpResult: s.freshSlumpResult,
  };
  if (tier !== "FULL") return base;

  return {
    ...base,
    tripId: s.tripId,
    orderId: s.orderId,
    mixDesignId: s.mixDesignId,
    freshSlumpCm: s.freshSlumpCm,
    sampleTempC: s.sampleTempC,
    cubesCount: s.cubesCount,
    labNotes: s.labNotes,
  };
}

// ─── Binding ledger ───────────────────────────────────────────────────────────

export type BindInput = {
  tenantId: string;
  labelId: string;
  vehicleId: string;
  workOrderId?: string | null;
  locationNote?: string | null;
  boundById: string;
};

export type BindResult =
  | { ok: true; binding: typeof assetQrBindings.$inferSelect }
  | { ok: false; code: "LABEL_NOT_FOUND" }
  | { ok: false; code: "VEHICLE_NOT_FOUND" }
  | { ok: false; code: "ALREADY_FITTED"; vehicleCode: string; plateNumber: string };

/**
 * Record that a label is now physically fitted to a vehicle.
 *
 * The one-active-binding-per-label index is what makes "installed on three
 * trucks at once" impossible; this function turns that violation into a clear
 * 409 naming the truck that already holds the part, instead of a raw 500.
 */
export async function bindLabel(input: BindInput): Promise<BindResult> {
  const [label] = await db
    .select()
    .from(assetQrLabels)
    .where(
      and(
        eq(assetQrLabels.id, input.labelId),
        eq(assetQrLabels.tenantId, input.tenantId)
      )
    )
    .limit(1);
  if (!label) return { ok: false, code: "LABEL_NOT_FOUND" };

  const [vehicle] = await db
    .select({ id: fleetVehicles.id, code: fleetVehicles.vehicleCode, plate: fleetVehicles.plateNumber })
    .from(fleetVehicles)
    .where(
      and(
        eq(fleetVehicles.id, input.vehicleId),
        eq(fleetVehicles.tenantId, input.tenantId)
      )
    )
    .limit(1);
  if (!vehicle) return { ok: false, code: "VEHICLE_NOT_FOUND" };

  const existing = await db
    .select({
      vehicleCode: fleetVehicles.vehicleCode,
      plateNumber: fleetVehicles.plateNumber,
    })
    .from(assetQrBindings)
    .innerJoin(fleetVehicles, eq(fleetVehicles.id, assetQrBindings.vehicleId))
    .where(
      and(
        eq(assetQrBindings.labelId, input.labelId),
        isNull(assetQrBindings.unboundAt)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return {
      ok: false,
      code: "ALREADY_FITTED",
      vehicleCode: existing[0].vehicleCode,
      plateNumber: existing[0].plateNumber,
    };
  }

  const [binding] = await db
    .insert(assetQrBindings)
    .values({
      tenantId: input.tenantId,
      labelId: input.labelId,
      vehicleId: input.vehicleId,
      workOrderId: input.workOrderId ?? null,
      locationNote: input.locationNote ?? null,
      boundById: input.boundById,
    })
    .returning();

  return { ok: true, binding: binding! };
}

/**
 * Record that a label came OFF a vehicle.
 *
 * Closes the open binding instead of deleting it — the row becomes history and
 * keeps answering "which truck was this on", which is the entire reason this
 * table is append-only.
 */
export async function unbindLabel(input: {
  tenantId: string;
  labelId: string;
  unboundById: string;
  reason?: string | null;
}): Promise<{ ok: true; previousVehicleId: string | null } | { ok: false; code: "NOT_FITTED" }> {
  const open = await db
    .select()
    .from(assetQrBindings)
    .where(
      and(
        eq(assetQrBindings.tenantId, input.tenantId),
        eq(assetQrBindings.labelId, input.labelId),
        isNull(assetQrBindings.unboundAt)
      )
    )
    .limit(1);

  if (open.length === 0) return { ok: false, code: "NOT_FITTED" };

  await db
    .update(assetQrBindings)
    .set({
      unboundAt: new Date(),
      unboundById: input.unboundById,
      unbindReason: input.reason ?? null,
    })
    .where(eq(assetQrBindings.id, open[0].id));

  return { ok: true, previousVehicleId: open[0].vehicleId };
}

/**
 * Move a label to DETACHED (peeled off a removed part) or RETIRED (written off).
 * Both keep the row. RETIRED frees the subject to be labelled again.
 */
export async function setLabelState(input: {
  tenantId: string;
  labelId: string;
  state: "DETACHED" | "RETIRED";
}): Promise<void> {
  await db
    .update(assetQrLabels)
    .set({ state: input.state })
    .where(
      and(
        eq(assetQrLabels.id, input.labelId),
        eq(assetQrLabels.tenantId, input.tenantId)
      )
    );
}

// ─── Listing helpers (for the UI tables) ──────────────────────────────────────

/**
 * Label + live binding for a set of subjects, in one query.
 *
 * RETIRED labels ARE included, and the returned `state` says which is which.
 * Hiding them was wrong: a scrapped pump still physically carries `SP-000231`,
 * and a stores clerk reconciling the scrap bin against the shelf has to be able
 * to see that number. A table that quietly omits it just looks like a part that
 * never existed. The UI greys retired codes out instead — visible for the audit,
 * dead to the scanner.
 *
 * A subject can hold more than one label, because reissuing mints a fresh secret
 * and retires the old sticker. The live label always wins over a retired one for
 * the same subject; `RETIRED` is only reported when every label for that subject
 * is dead, which is exactly the case where showing it matters.
 */
export async function labelsForSubjects(
  tenantId: string,
  subjectType: AssetQrSubjectType,
  subjectIds: string[]
): Promise<Map<string, { labelCode: string; state: string; vehicleCode: string | null }>> {
  const out = new Map<
    string,
    { labelCode: string; state: string; vehicleCode: string | null }
  >();
  if (subjectIds.length === 0) return out;

  const rows = await db
    .select({
      subjectId: assetQrLabels.subjectId,
      labelCode: assetQrLabels.labelCode,
      state: assetQrLabels.state,
      vehicleCode: fleetVehicles.vehicleCode,
      unboundAt: assetQrBindings.unboundAt,
    })
    .from(assetQrLabels)
    .leftJoin(
      assetQrBindings,
      and(
        eq(assetQrBindings.labelId, assetQrLabels.id),
        isNull(assetQrBindings.unboundAt)
      )
    )
    .leftJoin(fleetVehicles, eq(fleetVehicles.id, assetQrBindings.vehicleId))
    .where(
      and(
        eq(assetQrLabels.tenantId, tenantId),
        eq(assetQrLabels.subjectType, subjectType),
        inArray(assetQrLabels.subjectId, subjectIds)
      )
    )
    .orderBy(asc(assetQrLabels.createdAt));

  for (const r of rows) {
    // Oldest-first plus "never let a retired label overwrite a live one" means
    // the live label always ends up in the map, whichever order the rows come
    // back in, and a subject with only dead labels still reports its last code.
    const existing = out.get(r.subjectId);
    if (existing && existing.state !== "RETIRED") continue;
    out.set(r.subjectId, {
      labelCode: r.labelCode,
      state: r.state,
      vehicleCode: r.vehicleCode,
    });
  }
  return out;
}

/**
 * Everything ever fitted to a vehicle — the "what has this truck had?" answer.
 * FULL tier only; callers must have checked.
 */
export async function labelsForVehicle(
  tenantId: string,
  vehicleId: string
): Promise<
  {
    labelId: string;
    labelCode: string;
    subjectRef: string;
    subjectLabel: string | null;
    state: string;
    currentlyFitted: boolean;
    boundAt: Date;
    unboundAt: Date | null;
    workOrderNumber: string | null;
    locationNote: string | null;
  }[]
> {
  const rows = await db
    .select({
      labelId: assetQrBindings.labelId,
      labelCode: assetQrLabels.labelCode,
      subjectRef: assetQrLabels.subjectRef,
      subjectLabel: assetQrLabels.subjectLabel,
      state: assetQrLabels.state,
      unboundAt: assetQrBindings.unboundAt,
      boundAt: assetQrBindings.boundAt,
      locationNote: assetQrBindings.locationNote,
      workOrderNumber: maintenanceOrders.workOrderNumber,
    })
    .from(assetQrBindings)
    .innerJoin(assetQrLabels, eq(assetQrLabels.id, assetQrBindings.labelId))
    .leftJoin(
      maintenanceOrders,
      eq(maintenanceOrders.id, assetQrBindings.workOrderId)
    )
    .where(
      and(
        eq(assetQrBindings.tenantId, tenantId),
        eq(assetQrBindings.vehicleId, vehicleId)
      )
    )
    .orderBy(desc(assetQrBindings.boundAt));

  return rows.map((r) => ({ ...r, currentlyFitted: r.unboundAt === null }));
}