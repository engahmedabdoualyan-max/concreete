/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  اهلاك معدات — asset depreciation (vehicles + equipment)
 * ============================================================
 *  Straight-line depreciation driven by an annual rate:
 *      monthly = (purchaseCost − salvage) × rate% / 100 / 12
 *  «تشغيل إهلاك شهر» writes one `depreciation_entries` row per active
 *  asset, capped at the depreciable base, and auto-links a ledger
 *  entry. The unique (tenant, asset, period) index makes a re-run a
 *  no-op — a month can never be posted twice.
 * ============================================================
 */

import { db } from "@/db";
import {
  depreciationAssets,
  depreciationEntries,
  ledgerEntries,
  fleetVehicles,
  equipment,
} from "@/db/schema";
import { eq, and, desc, asc, sql, inArray, gte, lt, lte, isNull } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DepreciationSource = "vehicle" | "equipment";

export interface UpsertDepreciationAssetInput {
  source: DepreciationSource;
  vehicleId?: string | null;
  equipmentId?: string | null;
  /** SAR cents */
  purchaseCostSar: number;
  purchaseDate?: Date | null;
  /** e.g. 25 = 25% per year (straight line) */
  annualRatePct: number;
  /** SAR cents */
  salvageValueSar?: number;
  notes?: string | null;
}

export interface AssetOption {
  id: string;
  label: string;
  detail: string | null;
}

export class DepreciationAssetNotFoundError extends Error {
  constructor() {
    super("الأصل غير موجود");
    this.name = "DepreciationAssetNotFoundError";
  }
}

/** 409 — the vehicle/equipment is already registered as a depreciating asset. */
export class DepreciationAssetExistsError extends Error {
  constructor() {
    super("هذه المركبة/المعدة مضافة بالإهلاك بالفعل");
    this.name = "DepreciationAssetExistsError";
  }
}

/** 409 — the asset already has posted entries; deactivate instead of deleting. */
export class DepreciationAssetHasEntriesError extends Error {
  constructor() {
    super("لا يمكن حذف أصل مُهلك — استخدم إيقاف التفعيل بدل الحذف حفاظاً على القيود");
    this.name = "DepreciationAssetHasEntriesError";
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function firstOfMonth(d: Date): string {
  return toDateString(new Date(d.getFullYear(), d.getMonth(), 1));
}

interface AssetRow {
  id: string;
  source: DepreciationSource;
  vehicleId: string | null;
  equipmentId: string | null;
  assetLabel: string;
  purchaseCostSar: number;
  purchaseDate: string | null;
  annualRatePct: string;
  salvageValueSar: number;
  isActive: boolean;
  notes: string | null;
}

/** Depreciable base in cents: cost − salvage (never below 0). */
function baseOf(a: AssetRow): number {
  return Math.max(0, a.purchaseCostSar - a.salvageValueSar);
}

/** Full monthly charge (cents) before the remaining-base cap. */
function monthlyRaw(a: AssetRow): number {
  const rate = Number(a.annualRatePct) || 0;
  return Math.round((baseOf(a) * rate) / 100 / 12);
}

// ─── Listing ──────────────────────────────────────────────────────────────────

export interface DepreciationListResult {
  assets: Array<{
    id: string;
    source: DepreciationSource;
    vehicleId: string | null;
    equipmentId: string | null;
    assetLabel: string;
    detail: string | null;
    purchaseCostSar: number;
    purchaseDate: string | null;
    annualRatePct: string;
    salvageValueSar: number;
    isActive: boolean;
    notes: string | null;
    monthlyDepSar: number;
    accumulatedSar: number;
    bookValueSar: number;
    postedInPeriod: boolean;
    postedAmountSar: number;
  }>;
  vehicleOptions: AssetOption[];
  equipmentOptions: AssetOption[];
  summary: {
    assetCount: number;
    activeCount: number;
    totalCostSar: number;
    totalAccumulatedSar: number;
    totalBookValueSar: number;
    monthlyTotalSar: number;
    postedThisPeriodSar: number;
  };
}

export async function listDepreciation(
  tenantId: string,
  opts: { period?: Date } = {}
): Promise<DepreciationListResult> {
  const period = firstOfMonth(opts.period ?? new Date());
  const nextMonth = toDateString(
    new Date(new Date(period).getFullYear(), new Date(period).getMonth() + 1, 1)
  );

  const rows = await db
    .select({
      asset: depreciationAssets,
      vehicleCode: fleetVehicles.vehicleCode,
      plateNumber: fleetVehicles.plateNumber,
      vehicleType: fleetVehicles.vehicleType,
      equipCode: equipment.equipmentCode,
      equipName: equipment.name,
      equipNameAr: equipment.nameAr,
    })
    .from(depreciationAssets)
    .leftJoin(fleetVehicles, eq(depreciationAssets.vehicleId, fleetVehicles.id))
    .leftJoin(equipment, eq(depreciationAssets.equipmentId, equipment.id))
    .where(eq(depreciationAssets.tenantId, tenantId))
    .orderBy(asc(depreciationAssets.assetLabel));

  const assetIds = rows.map((r) => r.asset.id);
  const [accumRows, periodRows] = await Promise.all([
    assetIds.length
      ? db
          .select({
            assetId: depreciationEntries.assetId,
            total: sql<number>`coalesce(sum(${depreciationEntries.amountSar}), 0)`,
          })
          .from(depreciationEntries)
          .where(
            and(
              eq(depreciationEntries.tenantId, tenantId),
              inArray(depreciationEntries.assetId, assetIds)
            )
          )
          .groupBy(depreciationEntries.assetId)
      : Promise.resolve([]),
    assetIds.length
      ? db
          .select({
            assetId: depreciationEntries.assetId,
            amountSar: depreciationEntries.amountSar,
          })
          .from(depreciationEntries)
          .where(
            and(
              eq(depreciationEntries.tenantId, tenantId),
              eq(depreciationEntries.periodMonth, period),
              inArray(depreciationEntries.assetId, assetIds)
            )
          )
      : Promise.resolve([]),
  ]);

  const accumMap = new Map(accumRows.map((r) => [r.assetId, Number(r.total)]));
  const periodMap = new Map(periodRows.map((r) => [r.assetId, Number(r.amountSar)]));

  const assets = rows.map((r) => {
    const a = r.asset;
    const accumulated = accumMap.get(a.id) ?? 0;
    const remaining = Math.max(0, a.purchaseCostSar - a.salvageValueSar - accumulated);
    const monthly = Math.min(monthlyRaw(a as AssetRow), remaining);
    const detail =
      a.source === "vehicle"
        ? [r.vehicleCode, r.plateNumber, r.vehicleType].filter(Boolean).join(" · ") || null
        : [r.equipCode, r.equipNameAr ?? r.equipName].filter(Boolean).join(" · ") || null;
    return {
      id: a.id,
      source: a.source,
      vehicleId: a.vehicleId,
      equipmentId: a.equipmentId,
      assetLabel: a.assetLabel,
      detail,
      purchaseCostSar: a.purchaseCostSar,
      purchaseDate: a.purchaseDate,
      annualRatePct: a.annualRatePct,
      salvageValueSar: a.salvageValueSar,
      isActive: a.isActive,
      notes: a.notes,
      monthlyDepSar: a.isActive ? monthly : 0,
      accumulatedSar: accumulated,
      bookValueSar: a.purchaseCostSar - accumulated,
      postedInPeriod: periodMap.has(a.id),
      postedAmountSar: periodMap.get(a.id) ?? 0,
    };
  });

  // ── options for the add/edit form (active rows only) ──
  const [vehRows, eqRows] = await Promise.all([
    db
      .select({
        id: fleetVehicles.id,
        vehicleCode: fleetVehicles.vehicleCode,
        plateNumber: fleetVehicles.plateNumber,
        vehicleType: fleetVehicles.vehicleType,
        model: fleetVehicles.model,
      })
      .from(fleetVehicles)
      .where(and(eq(fleetVehicles.tenantId, tenantId), eq(fleetVehicles.isActive, true)))
      .orderBy(asc(fleetVehicles.vehicleCode)),
    db
      .select({
        id: equipment.id,
        equipmentCode: equipment.equipmentCode,
        name: equipment.name,
        nameAr: equipment.nameAr,
      })
      .from(equipment)
      .where(and(eq(equipment.tenantId, tenantId), eq(equipment.isActive, true)))
      .orderBy(asc(equipment.equipmentCode)),
  ]);

  const usedVehicleIds = new Set(rows.filter((r) => r.asset.source === "vehicle").map((r) => r.asset.vehicleId));
  const usedEquipmentIds = new Set(rows.filter((r) => r.asset.source === "equipment").map((r) => r.asset.equipmentId));

  const vehicleOptions: AssetOption[] = vehRows
    .filter((v) => !usedVehicleIds.has(v.id))
    .map((v) => ({
      id: v.id,
      label: `${v.vehicleCode} — ${v.plateNumber}`,
      detail: [v.vehicleType, v.model].filter(Boolean).join(" · ") || null,
    }));

  const equipmentOptions: AssetOption[] = eqRows
    .filter((e) => !usedEquipmentIds.has(e.id))
    .map((e) => ({
      id: e.id,
      label: `${e.equipmentCode} — ${e.nameAr ?? e.name}`,
      detail: null,
    }));

  const active = assets.filter((a) => a.isActive);
  return {
    assets,
    vehicleOptions,
    equipmentOptions,
    summary: {
      assetCount: assets.length,
      activeCount: active.length,
      totalCostSar: assets.reduce((s, a) => s + a.purchaseCostSar, 0),
      totalAccumulatedSar: assets.reduce((s, a) => s + a.accumulatedSar, 0),
      totalBookValueSar: assets.reduce((s, a) => s + a.bookValueSar, 0),
      monthlyTotalSar: active.reduce((s, a) => s + a.monthlyDepSar, 0),
      postedThisPeriodSar: periodRows.reduce((s, r) => s + Number(r.amountSar), 0),
    },
  };
}

// ─── Upsert / delete ──────────────────────────────────────────────────────────

async function labelFor(tenantId: string, input: UpsertDepreciationAssetInput): Promise<string> {
  if (input.source === "vehicle") {
    const [v] = await db
      .select({ code: fleetVehicles.vehicleCode, plate: fleetVehicles.plateNumber })
      .from(fleetVehicles)
      .where(and(eq(fleetVehicles.id, input.vehicleId ?? ""), eq(fleetVehicles.tenantId, tenantId)));
    if (!v) throw new Error("المركبة غير موجودة");
    return `${v.code} — ${v.plate}`;
  }
  const [e] = await db
    .select({ code: equipment.equipmentCode, name: equipment.name, nameAr: equipment.nameAr })
    .from(equipment)
    .where(and(eq(equipment.id, input.equipmentId ?? ""), eq(equipment.tenantId, tenantId)));
  if (!e) throw new Error("المعدة غير موجودة");
  return `${e.code} — ${e.nameAr ?? e.name}`;
}

export async function createDepreciationAsset(
  tenantId: string,
  createdById: string,
  input: UpsertDepreciationAssetInput
) {
  const assetLabel = await labelFor(tenantId, input);

  // A vehicle/equipment belongs to exactly one asset row (partial unique
  // index in the DB). Pre-check so the caller gets a clean 409 instead of
  // a raw constraint violation.
  if (input.source === "vehicle" && input.vehicleId) {
    const [dupe] = await db
      .select({ id: depreciationAssets.id })
      .from(depreciationAssets)
      .where(and(eq(depreciationAssets.tenantId, tenantId), eq(depreciationAssets.vehicleId, input.vehicleId)))
      .limit(1);
    if (dupe) throw new DepreciationAssetExistsError();
  }
  if (input.source === "equipment" && input.equipmentId) {
    const [dupe] = await db
      .select({ id: depreciationAssets.id })
      .from(depreciationAssets)
      .where(and(eq(depreciationAssets.tenantId, tenantId), eq(depreciationAssets.equipmentId, input.equipmentId)))
      .limit(1);
    if (dupe) throw new DepreciationAssetExistsError();
  }

  const [row] = await db
    .insert(depreciationAssets)
    .values({
      tenantId,
      source: input.source,
      vehicleId: input.source === "vehicle" ? input.vehicleId ?? null : null,
      equipmentId: input.source === "equipment" ? input.equipmentId ?? null : null,
      assetLabel,
      purchaseCostSar: input.purchaseCostSar,
      purchaseDate: input.purchaseDate ? toDateString(input.purchaseDate) : null,
      annualRatePct: String(input.annualRatePct),
      salvageValueSar: input.salvageValueSar ?? 0,
      notes: input.notes ?? null,
      createdById,
    })
    .returning();
  return row;
}

export async function updateDepreciationAsset(
  tenantId: string,
  assetId: string,
  input: Partial<UpsertDepreciationAssetInput> & { isActive?: boolean }
) {
  const [existing] = await db
    .select()
    .from(depreciationAssets)
    .where(and(eq(depreciationAssets.id, assetId), eq(depreciationAssets.tenantId, tenantId)));
  if (!existing) throw new DepreciationAssetNotFoundError();

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.purchaseCostSar !== undefined) patch.purchaseCostSar = input.purchaseCostSar;
  if (input.purchaseDate !== undefined) patch.purchaseDate = input.purchaseDate ? toDateString(input.purchaseDate) : null;
  if (input.annualRatePct !== undefined) patch.annualRatePct = String(input.annualRatePct);
  if (input.salvageValueSar !== undefined) patch.salvageValueSar = input.salvageValueSar;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.isActive !== undefined) patch.isActive = input.isActive;

  const [row] = await db.update(depreciationAssets).set(patch).where(eq(depreciationAssets.id, assetId)).returning();
  return row;
}

export async function deleteDepreciationAsset(tenantId: string, assetId: string) {
  const [existing] = await db
    .select({ id: depreciationAssets.id })
    .from(depreciationAssets)
    .where(and(eq(depreciationAssets.id, assetId), eq(depreciationAssets.tenantId, tenantId)));
  if (!existing) throw new DepreciationAssetNotFoundError();

  const [used] = await db
    .select({ id: depreciationEntries.id })
    .from(depreciationEntries)
    .where(eq(depreciationEntries.assetId, assetId))
    .limit(1);
  if (used) throw new DepreciationAssetHasEntriesError();

  await db.delete(depreciationAssets).where(eq(depreciationAssets.id, assetId));
}

// ─── التشغيل — run a whole month ──────────────────────────────────────────────

export async function runDepreciation(
  tenantId: string,
  createdById: string,
  period: Date
) {
  const periodMonth = firstOfMonth(period);
  const periodDate = new Date(periodMonth);
  const nextMonth = toDateString(new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, 1));

  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(depreciationAssets)
      .where(and(eq(depreciationAssets.tenantId, tenantId), eq(depreciationAssets.isActive, true)))
      .orderBy(asc(depreciationAssets.assetLabel));

    let created = 0;
    let skippedExisting = 0;
    let skippedNotOwned = 0;
    let skippedFully = 0;
    let totalPostedSar = 0;

    for (const a of rows) {
      // Not owned yet in that period → nothing to depreciate.
      if (a.purchaseDate && periodMonth < firstOfMonth(new Date(a.purchaseDate))) {
        skippedNotOwned++;
        continue;
      }

      const [already] = await tx
        .select({ id: depreciationEntries.id })
        .from(depreciationEntries)
        .where(
          and(
            eq(depreciationEntries.tenantId, tenantId),
            eq(depreciationEntries.assetId, a.id),
            eq(depreciationEntries.periodMonth, periodMonth)
          )
        )
        .limit(1);
      if (already) {
        skippedExisting++;
        continue;
      }

      const accumulatedAgg = await tx
        .select({ total: sql<number>`coalesce(sum(${depreciationEntries.amountSar}), 0)` })
        .from(depreciationEntries)
        .where(
          and(eq(depreciationEntries.tenantId, tenantId), eq(depreciationEntries.assetId, a.id))
        );
      const accumulated = Number(accumulatedAgg[0]?.total ?? 0);
      const base = Math.max(0, a.purchaseCostSar - a.salvageValueSar);
      const remaining = Math.max(0, base - accumulated);
      const amount = Math.min(monthlyRaw(a as AssetRow), remaining);
      if (amount <= 0) {
        skippedFully++;
        continue;
      }

      const [entry] = await tx
        .insert(depreciationEntries)
        .values({
          tenantId,
          assetId: a.id,
          periodMonth,
          amountSar: amount,
          createdById,
        })
        .returning();

      const [ledger] = await tx
        .insert(ledgerEntries)
        .values({
          tenantId,
          date: new Date(periodMonth),
          description: `إهلاك ${a.assetLabel} — ${periodMonth.slice(0, 7)}`,
          amountSar: amount,
          transactionType: "expense",
          referenceNumber: `DEP-${periodMonth.slice(0, 7)}`,
          counterpartyType: "asset",
          counterpartyId: a.id,
          counterpartyName: a.assetLabel,
          createdById,
        })
        .returning();

      await tx
        .update(depreciationEntries)
        .set({ ledgerEntryId: ledger.id })
        .where(eq(depreciationEntries.id, entry.id));

      created++;
      totalPostedSar += amount;
    }

    return {
      periodMonth: periodMonth.slice(0, 7),
      nextMonth,
      created,
      skippedExisting,
      skippedNotOwned,
      skippedFully,
      totalPostedSar,
    };
  });
}
