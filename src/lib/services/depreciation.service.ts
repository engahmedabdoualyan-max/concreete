/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  اهلاك معدات — asset depreciation (vehicles + equipment)
 * ============================================================
 *
 * The goal is NOT "write the asset down to zero". The goal is:
 *   «by the time the asset reaches the end of its life, the company
 *     must have accumulated (out of profit) the price of a NEW unit
 *     of the same kind».
 *
 * So every asset carries:
 *   • purchase cost          — what we paid
 *   • useful life (years)    — straight line, editable per asset
 *   • annual rate (%)        — implied = 100 / life, but overridable
 *   • assessment value       — the asset's worth in its CURRENT state
 *                               (e.g. a tipper sold today for 50k while a
 *                               new one costs 150k). Acts as the book floor.
 *   • replacement cost       — price of a NEW similar unit today
 *   • inflation rate (%)     — grows the replacement price to end-of-life
 *
 * Monthly charge = book depreciation + replacement-fund top-up
 *   bookMonthly  = (cost − floor) × rate% / 12        (lowers book value)
 *   fundMonthly  = (target − bookEnd) / remainingMonths   (cash for a new unit)
 *   target       = replacement × (1 + inflation)^yearsRemaining
 *                 (or book base when no replacement estimate is set)
 *
 * Because the two parts are tracked separately, the accumulated amount at
 * end-of-life always equals the target — exactly the price of a new unit.
 *
 * «تشغيل إهلاك شهر» writes one `depreciation_entries` row per asset per
 * month (unique index ⇒ re-running is a no-op) and auto-links a ledger entry.
 */

import { db } from "@/db";
import {
  depreciationAssets,
  depreciationEntries,
  depreciationSettings,
  ledgerEntries,
  fleetVehicles,
  equipment,
} from "@/db/schema";
import { eq, and, asc, sql, inArray } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DepreciationSource = "vehicle" | "equipment";
export type DepreciationLifeSource = "type_default" | "manual" | "manufacture_year";

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
  usefulLifeYears?: number | null;
  lifeSource?: DepreciationLifeSource;
  /** SAR cents — price of a new similar unit today */
  replacementCostEstSar?: number;
  inflationRatePct?: number;
  /** SAR cents — worth in its current state (book floor) */
  assessmentValueSar?: number;
  replacementSource?: string | null;
  notes?: string | null;
}

export interface AssetOption {
  id: string;
  label: string;
  detail: string | null;
  /** Recommended life in years for this kind of asset */
  suggestedLifeYears: number;
  /** Suggested annual rate (100 / life) */
  suggestedRatePct: number;
  /** Manufacture year (vehicles) or commissioning year (equipment) */
  referenceYear: number | null;
  /** Price of a new similar unit today, derived from our own records */
  suggestedReplacementSar: number;
  /** Where the suggestion came from (for the UI hint) */
  suggestionSource: string | null;
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

// ─── Presets ──────────────────────────────────────────────────────────────────

/**
 * Recommended useful life per vehicle type / equipment category.
 * Straight-line ⇒ annual rate = 100 / life.
 */
export const LIFE_PRESETS: Record<string, { years: number; labelAr: string }> = {
  MIXER_TRUCK: { years: 11, labelAr: "خلاطة خرسانة" },
  TRANSIT_MIXER: { years: 11, labelAr: "خلاطة نقل" },
  TIPPER_TRUCK: { years: 13, labelAr: "قلاب" },
  CONCRETE_PUMP: { years: 13, labelAr: "مضخة خرسانة" },
  SERVICE_TRUCK: { years: 10, labelAr: "سيارة خدمة" },
  WATER_TANKER: { years: 12, labelAr: "صهريج مياه" },
  MIXER: { years: 20, labelAr: "خلاطة ثابتة" },
  PUMP: { years: 15, labelAr: "مضخة" },
  GENERATOR: { years: 12, labelAr: "مولد كهرباء" },
  COMPRESSOR: { years: 12, labelAr: "ضاغط هواء" },
  CRUSHER: { years: 15, labelAr: "كسّارة" },
  CONVEYOR: { years: 15, labelAr: "سير ناقل" },
  OTHER: { years: 10, labelAr: "معدة أخرى" },
};

export const DEFAULT_LIFE_YEARS = 10;

/** Life suggested for an asset kind (vehicle type or equipment category). */
export function suggestedLifeFor(kind: string | null | undefined): number {
  if (!kind) return DEFAULT_LIFE_YEARS;
  return LIFE_PRESETS[kind]?.years ?? DEFAULT_LIFE_YEARS;
}

/** Straight-line annual rate for a given life. */
export function defaultRateForLife(years: number | null | undefined): number {
  if (!years || years <= 0) return 100 / DEFAULT_LIFE_YEARS;
  return Math.round((100 / years) * 100) / 100;
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

/** Whole months between two YYYY-MM-DD strings (b − a). */
function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}

function addMonths(monthStart: string, months: number): string {
  const [y, m] = monthStart.split("-").map(Number);
  const d = new Date(y, m - 1 + months, 1);
  return firstOfMonth(d);
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** The book floor: the asset's worth in its current state (never above cost). */
function floorOf(a: any): number {
  const cost = num(a.purchaseCostSar);
  const floor = Math.max(num(a.salvageValueSar), num(a.assessmentValueSar));
  return Math.min(cost, Math.max(0, floor));
}

/** Depreciable book base = cost − floor. */
function bookBaseOf(a: any): number {
  return Math.max(0, num(a.purchaseCostSar) - floorOf(a));
}

/**
 * Resolve the useful life:
 *  - manual          → the value stored on the asset
 *  - type_default    → the preset for the vehicle type / equipment category
 *  - manufacture_year→ preset life minus the age of the asset
 */
export function resolveUsefulLife(
  a: { lifeSource?: string | null; usefulLifeYears?: number | null },
  kind?: string | null,
  referenceYear?: number | null
): number | null {
  const source = a.lifeSource ?? "manual";
  if (source === "manufacture_year") {
    const def = suggestedLifeFor(kind);
    if (!referenceYear) return def;
    const age = Math.max(0, new Date().getFullYear() - referenceYear);
    return Math.max(1, def - age);
  }
  if (source === "type_default") return suggestedLifeFor(kind);
  return a.usefulLifeYears ?? null;
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
    assessmentValueSar: number;
    floorValueSar: number;
    usefulLifeYears: number | null;
    lifeSource: string | null;
    replacementCostEstSar: number;
    inflationRatePct: string;
    replacementSource: string | null;
    isActive: boolean;
    notes: string | null;
    monthlyDepSar: number;
    monthlyBookSar: number;
    monthlyFundSar: number;
    accumulatedSar: number;
    accumulatedBookSar: number;
    bookValueSar: number;
    /** cash target for a new unit at end-of-life */
    replacementTargetSar: number;
    /** target − accumulated (what is still missing) */
    fundGapSar: number;
    /** months left until the asset reaches end-of-life */
    monthsRemaining: number | null;
    postedInPeriod: boolean;
    postedAmountSar: number;
  }>;
  vehicleOptions: AssetOption[];
  equipmentOptions: AssetOption[];
  settings: {
    defaultInflationRatePct: string;
    defaultLifeYears: number;
  };
  presets: Array<{ key: string; labelAr: string; years: number; ratePct: number }>;
  summary: {
    assetCount: number;
    activeCount: number;
    totalCostSar: number;
    totalAccumulatedSar: number;
    totalBookValueSar: number;
    monthlyTotalSar: number;
    monthlyBookTotalSar: number;
    monthlyFundTotalSar: number;
    postedThisPeriodSar: number;
    totalReplacementTargetSar: number;
    totalFundGapSar: number;
  };
}

export async function getDepreciationSettings(tenantId: string) {
  const rows = await db
    .select()
    .from(depreciationSettings)
    .where(eq(depreciationSettings.tenantId, tenantId))
    .limit(1);
  if (rows.length > 0) return rows[0];
  return {
    id: "default",
    tenantId,
    defaultInflationRatePct: "3.00",
    defaultLifeYears: DEFAULT_LIFE_YEARS,
  } as typeof depreciationSettings.$inferSelect;
}

export async function updateDepreciationSettings(
  tenantId: string,
  userId: string,
  patch: { defaultInflationRatePct?: number; defaultLifeYears?: number }
) {
  const existing = await db
    .select({ id: depreciationSettings.id })
    .from(depreciationSettings)
    .where(eq(depreciationSettings.tenantId, tenantId))
    .limit(1);

  if (existing.length === 0) {
    const [row] = await db
      .insert(depreciationSettings)
      .values({
        tenantId,
        defaultInflationRatePct: String(patch.defaultInflationRatePct ?? 3),
        defaultLifeYears: patch.defaultLifeYears ?? DEFAULT_LIFE_YEARS,
        updatedById: userId,
      })
      .returning();
    return row;
  }

  const values: Record<string, unknown> = { updatedAt: new Date(), updatedById: userId };
  if (patch.defaultInflationRatePct !== undefined)
    values.defaultInflationRatePct = String(patch.defaultInflationRatePct);
  if (patch.defaultLifeYears !== undefined) values.defaultLifeYears = patch.defaultLifeYears;

  const [row] = await db
    .update(depreciationSettings)
    .set(values)
    .where(eq(depreciationSettings.id, existing[0].id))
    .returning();
  return row;
}

/**
 * The latest price we actually paid for a similar unit — used as the
 * suggested replacement cost.
 *
 * Vehicles are looked up in our own depreciation register (what we paid for
 * the same vehicle type); equipment comes from the plant's machinery register
 * (its own cost) and then from the depreciation register.
 */
async function replacementSuggestionFor(
  tenantId: string,
  kind: string | null,
  isVehicleType: boolean
): Promise<{ amountSar: number; source: string | null }> {
  if (!kind) return { amountSar: 0, source: null };

  if (isVehicleType) {
    // our own register — the most we paid for this kind of vehicle
    const fromRegister = await db
      .select({
        amountSar: sql<number>`max(${depreciationAssets.purchaseCostSar})`,
        count: sql<number>`count(*)`,
      })
      .from(depreciationAssets)
      .innerJoin(fleetVehicles, eq(depreciationAssets.vehicleId, fleetVehicles.id))
      .where(
        and(
          eq(depreciationAssets.tenantId, tenantId),
          eq(fleetVehicles.vehicleType, kind as never)
        )
      );

    if (Number(fromRegister[0]?.count ?? 0) > 0 && Number(fromRegister[0]?.amountSar ?? 0) > 0) {
      return { amountSar: Number(fromRegister[0].amountSar), source: "register" };
    }
    return { amountSar: 0, source: null };
  }

  // the plant's own machinery register
  const fromEquipment = await db
    .select({
      avgCost: sql<number>`avg(${equipment.costSar})`,
      count: sql<number>`count(${equipment.costSar})`,
    })
    .from(equipment)
    .where(and(eq(equipment.tenantId, tenantId), eq(equipment.category, kind)));

  if (Number(fromEquipment[0]?.count ?? 0) > 0 && Number(fromEquipment[0]?.avgCost ?? 0) > 0) {
    // equipment.costSar is in SAR (not cents)
    const sar = Number(fromEquipment[0].avgCost);
    return { amountSar: Math.round(sar * 100), source: "equipment_register" };
  }

  // and what we paid for equipment of the same category
  const fromRegister = await db
    .select({
      amountSar: sql<number>`max(${depreciationAssets.purchaseCostSar})`,
      count: sql<number>`count(*)`,
    })
    .from(depreciationAssets)
    .innerJoin(equipment, eq(depreciationAssets.equipmentId, equipment.id))
    .where(
      and(
        eq(depreciationAssets.tenantId, tenantId),
        eq(equipment.category, kind)
      )
    );

  if (Number(fromRegister[0]?.count ?? 0) > 0 && Number(fromRegister[0]?.amountSar ?? 0) > 0) {
    return { amountSar: Number(fromRegister[0].amountSar), source: "register" };
  }

  return { amountSar: 0, source: null };
}

export async function listDepreciation(
  tenantId: string,
  opts: { period?: Date } = {}
): Promise<DepreciationListResult> {
  const period = firstOfMonth(opts.period ?? new Date());

  const [rows, settings] = await Promise.all([
    db
      .select({
        asset: depreciationAssets,
        vehicleCode: fleetVehicles.vehicleCode,
        plateNumber: fleetVehicles.plateNumber,
        vehicleType: fleetVehicles.vehicleType,
        vehicleYear: fleetVehicles.year,
        equipCode: equipment.equipmentCode,
        equipName: equipment.name,
        equipNameAr: equipment.nameAr,
        equipCategory: equipment.category,
        equipCommissionedAt: equipment.commissionedAt,
      })
      .from(depreciationAssets)
      .leftJoin(fleetVehicles, eq(depreciationAssets.vehicleId, fleetVehicles.id))
      .leftJoin(equipment, eq(depreciationAssets.equipmentId, equipment.id))
      .where(eq(depreciationAssets.tenantId, tenantId))
      .orderBy(asc(depreciationAssets.assetLabel)),
    getDepreciationSettings(tenantId),
  ]);

  const assetIds = rows.map((r) => r.asset.id);
  const [accumRows, periodRows, bookRows] = await Promise.all([
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
    assetIds.length
      ? db
          .select({
            assetId: depreciationEntries.assetId,
            total: sql<number>`coalesce(sum(${depreciationEntries.bookAmountSar}), 0)`,
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
  ]);

  const accumMap = new Map(accumRows.map((r) => [r.assetId, Number(r.total)]));
  const bookMap = new Map(bookRows.map((r) => [r.assetId, Number(r.total)]));
  const periodMap = new Map(periodRows.map((r) => [r.assetId, Number(r.amountSar)]));

  const inflationDefault = num(settings.defaultInflationRatePct);

  const assets = rows.map((r) => {
    const a = r.asset as any;
    const accumulated = accumMap.get(a.id) ?? 0;
    const accumulatedBook = bookMap.get(a.id) ?? 0;
    const kind = a.source === "vehicle" ? r.vehicleType : r.equipCategory;
    const referenceYear =
      a.source === "vehicle"
        ? r.vehicleYear ?? (a.purchaseDate ? Number(String(a.purchaseDate).slice(0, 4)) : null)
        : r.equipCommissionedAt
          ? Number(String(r.equipCommissionedAt).slice(0, 4))
          : a.purchaseDate
            ? Number(String(a.purchaseDate).slice(0, 4))
            : null;

    const life = resolveUsefulLife(a, kind, referenceYear);
    const inflation = a.inflationRatePct !== null && a.inflationRatePct !== undefined
      ? num(a.inflationRatePct)
      : inflationDefault;

    const plan = planMonthly({
      asset: a,
      kind,
      referenceYear,
      life,
      inflation,
      accumulatedBook,
      accumulatedTotal: accumulated,
      monthStart: period,
    });

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
      purchaseCostSar: num(a.purchaseCostSar),
      purchaseDate: a.purchaseDate,
      annualRatePct: a.annualRatePct,
      salvageValueSar: num(a.salvageValueSar),
      assessmentValueSar: num(a.assessmentValueSar),
      floorValueSar: floorOf(a),
      usefulLifeYears: life,
      lifeSource: a.lifeSource ?? null,
      replacementCostEstSar: num(a.replacementCostEstSar),
      inflationRatePct: String(inflation),
      replacementSource: a.replacementSource ?? null,
      isActive: a.isActive,
      notes: a.notes,
      monthlyDepSar: a.isActive ? plan.total : 0,
      monthlyBookSar: a.isActive ? plan.book : 0,
      monthlyFundSar: a.isActive ? plan.fund : 0,
      accumulatedSar: accumulated,
      accumulatedBookSar: accumulatedBook,
      bookValueSar: num(a.purchaseCostSar) - accumulatedBook,
      replacementTargetSar: plan.target,
      fundGapSar: Math.max(0, plan.target - accumulated),
      monthsRemaining: plan.monthsRemaining,
      postedInPeriod: periodMap.has(a.id),
      postedAmountSar: periodMap.get(a.id) ?? 0,
    };
  });

  // ── options for the add/edit form ──
  const [vehRows, eqRows] = await Promise.all([
    db
      .select({
        id: fleetVehicles.id,
        vehicleCode: fleetVehicles.vehicleCode,
        plateNumber: fleetVehicles.plateNumber,
        vehicleType: fleetVehicles.vehicleType,
        model: fleetVehicles.model,
        year: fleetVehicles.year,
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
        category: equipment.category,
        costSar: equipment.costSar,
        commissionedAt: equipment.commissionedAt,
      })
      .from(equipment)
      .where(and(eq(equipment.tenantId, tenantId), eq(equipment.isActive, true)))
      .orderBy(asc(equipment.equipmentCode)),
  ]);

  const usedVehicleIds = new Set(rows.filter((r) => r.asset.source === "vehicle").map((r) => r.asset.vehicleId));
  const usedEquipmentIds = new Set(rows.filter((r) => r.asset.source === "equipment").map((r) => r.asset.equipmentId));

  // suggestions are looked up per kind — vehicle types and equipment
  // categories live in different tables, so they are keyed apart.
  const vehicleKinds = [
    ...new Set(vehRows.map((v) => v.vehicleType as string | null)),
  ].filter(Boolean) as string[];
  const equipmentKinds = [
    ...new Set(eqRows.map((e) => e.category as string | null)),
  ].filter(Boolean) as string[];

  const vehicleSuggestions = new Map<string, { amountSar: number; source: string | null }>();
  const equipmentSuggestions = new Map<string, { amountSar: number; source: string | null }>();
  await Promise.all([
    ...vehicleKinds.map(async (kind) => {
      vehicleSuggestions.set(kind, await replacementSuggestionFor(tenantId, kind, true));
    }),
    ...equipmentKinds.map(async (kind) => {
      equipmentSuggestions.set(kind, await replacementSuggestionFor(tenantId, kind, false));
    }),
  ]);

  const vehicleOptions: AssetOption[] = vehRows
    .filter((v) => !usedVehicleIds.has(v.id))
    .map((v) => {
      const life = suggestedLifeFor(v.vehicleType);
      const sug = vehicleSuggestions.get(v.vehicleType as string) ?? { amountSar: 0, source: null };
      return {
        id: v.id,
        label: `${v.vehicleCode} — ${v.plateNumber}`,
        detail: [v.vehicleType, v.model].filter(Boolean).join(" · ") || null,
        suggestedLifeYears: life,
        suggestedRatePct: defaultRateForLife(life),
        referenceYear: v.year ?? null,
        suggestedReplacementSar: sug.amountSar,
        suggestionSource: sug.source,
      };
    });

  const equipmentOptions: AssetOption[] = eqRows
    .filter((e) => !usedEquipmentIds.has(e.id))
    .map((e) => {
      const life = suggestedLifeFor(e.category);
      const sug = equipmentSuggestions.get(e.category as string) ?? { amountSar: 0, source: null };
      const own = num(e.costSar);
      return {
        id: e.id,
        label: `${e.equipmentCode} — ${e.nameAr ?? e.name}`,
        detail: e.category,
        suggestedLifeYears: life,
        suggestedRatePct: defaultRateForLife(life),
        referenceYear: e.commissionedAt ? Number(String(e.commissionedAt).slice(0, 4)) : null,
        suggestedReplacementSar: own > 0 ? Math.round(own * 100) : sug.amountSar,
        suggestionSource: own > 0 ? "equipment_register" : sug.source,
      };
    });

  const active = assets.filter((a) => a.isActive);

  return {
    assets,
    vehicleOptions,
    equipmentOptions,
    settings: {
      defaultInflationRatePct: String(settings.defaultInflationRatePct),
      defaultLifeYears: settings.defaultLifeYears,
    },
    presets: Object.entries(LIFE_PRESETS).map(([key, p]) => ({
      key,
      labelAr: p.labelAr,
      years: p.years,
      ratePct: defaultRateForLife(p.years),
    })),
    summary: {
      assetCount: assets.length,
      activeCount: active.length,
      totalCostSar: assets.reduce((s, a) => s + a.purchaseCostSar, 0),
      totalAccumulatedSar: assets.reduce((s, a) => s + a.accumulatedSar, 0),
      totalBookValueSar: assets.reduce((s, a) => s + a.bookValueSar, 0),
      monthlyTotalSar: active.reduce((s, a) => s + a.monthlyDepSar, 0),
      monthlyBookTotalSar: active.reduce((s, a) => s + a.monthlyBookSar, 0),
      monthlyFundTotalSar: active.reduce((s, a) => s + a.monthlyFundSar, 0),
      postedThisPeriodSar: periodRows.reduce((s, r) => s + Number(r.amountSar), 0),
      totalReplacementTargetSar: assets.reduce((s, a) => s + a.replacementTargetSar, 0),
      totalFundGapSar: assets.reduce((s, a) => s + a.fundGapSar, 0),
    },
  };
}

// ─── Monthly plan (book depreciation + replacement fund) ───────────────────────

interface PlanInput {
  asset: any;
  kind: string | null;
  referenceYear: number | null;
  life: number | null;
  inflation: number;
  accumulatedBook: number;
  /** total accumulated so far (book + fund) */
  accumulatedTotal?: number;
  /** the month being posted (defaults to today) */
  monthStart?: string | null;
}

/**
 * Work out the monthly charge split:
 *   book — lowers the book value, stops at the floor (current worth)
 *   fund — the cash we must keep aside for a NEW unit at end-of-life
 *
 * The fund is self-correcting: whatever is still missing from the target by
 * the end of the asset's life is spread over the months that are left, so
 * the accumulated total always lands exactly on the target.
 *
 * Mode A — a replacement estimate exists ⇒ the fund tops the depreciation up
 *          to the price of a new unit (inflated) at end-of-life.
 * Mode B — no replacement estimate ⇒ classic straight line on the book base.
 */
export interface AssetTimeline {
  /** first month of depreciation (the purchase month) */
  startMonth: string | null;
  /** first month after the asset's life ends */
  lifeEndMonth: string | null;
  /** months the asset is depreciated for in total */
  totalMonths: number | null;
  /** months from now until the end of life */
  monthsToEnd: number | null;
  /** years from now until the end of life (fractional) */
  yearsToEnd: number;
}

/** The asset's timeline: when it started and when its life ends. */
export function timelineOf(
  asset: any,
  referenceYear: number | null,
  life: number | null,
  fromMonth?: string
): AssetTimeline {
  const startMonth = asset.purchaseDate
    ? firstOfMonth(new Date(String(asset.purchaseDate)))
    : null;
  const lifeMonths = life && life > 0 ? life * 12 : null;
  const startYear = startMonth
    ? Number(startMonth.slice(0, 4))
    : referenceYear ?? new Date().getFullYear();
  const lifeEndMonth = lifeMonths ? addMonths(`${startYear}-01`, lifeMonths) : null;
  const today = fromMonth ?? firstOfMonth(new Date());
  const monthsToEnd = lifeEndMonth ? Math.max(0, monthsBetween(today, lifeEndMonth)) : null;
  return {
    startMonth,
    lifeEndMonth,
    totalMonths:
      lifeMonths && startMonth && lifeEndMonth
        ? Math.max(1, monthsBetween(startMonth, lifeEndMonth))
        : null,
    monthsToEnd,
    yearsToEnd: monthsToEnd !== null ? monthsToEnd / 12 : 0,
  };
}

/**
 * The cash the company must have saved by the end of the asset's life:
 * the price of a NEW similar unit today, grown by inflation until then.
 *
 * This is FROZEN when the asset is saved — otherwise the target would shrink
 * every month (the time left gets shorter) and the fund would land short of
 * the real future price.
 */
export function computeReplacementTarget(
  asset: any,
  referenceYear: number | null,
  life: number | null,
  inflationPct: number
): number {
  const replacement = num(asset.replacementCostEstSar);
  if (replacement <= 0) return 0;
  const timeline = timelineOf(asset, referenceYear, life);
  if (!timeline.lifeEndMonth) return 0;
  return Math.round(replacement * Math.pow(1 + inflationPct / 100, timeline.yearsToEnd));
}

/**
 * Work out the monthly charge split:
 *   book — lowers the book value, stops at the floor (current worth)
 *   fund — the cash we must keep aside for a NEW unit at end-of-life
 *
 * The fund is self-correcting: whatever is still missing from the target by
 * the end of the asset's life is spread over the months that are left, so
 * the accumulated total always lands exactly on the target.
 *
 * Mode A — a replacement target exists ⇒ the fund tops the depreciation up
 *          to the price of a new unit (inflated) at end-of-life.
 * Mode B — no replacement estimate ⇒ classic straight line on the book base.
 */
export function planMonthly(input: PlanInput): {
  book: number;
  fund: number;
  total: number;
  target: number;
  monthsRemaining: number | null;
  startMonth: string | null;
  lifeEndMonth: string | null;
  totalMonths: number | null;
} {
  const { asset, kind, referenceYear, life, inflation, accumulatedBook } = input;
  const accumulatedTotal = num(input.accumulatedTotal);
  const base = bookBaseOf(asset);
  const rate = num(asset.annualRatePct);

  const bookMonthly = Math.round((base * rate) / 100 / 12);
  const bookRemaining = Math.max(0, base - accumulatedBook);

  // ── timeline ──
  const timeline = timelineOf(asset, referenceYear, life, input.monthStart ?? undefined);
  const { startMonth, lifeEndMonth, totalMonths, monthsToEnd } = timeline;

  // ── replacement target: price of a NEW unit when this one dies ──
  // the frozen target wins; legacy rows without one are computed live.
  const frozenTarget = num(asset.replacementTargetSar);
  const target =
    frozenTarget > 0
      ? frozenTarget
      : computeReplacementTarget(asset, referenceYear, life, inflation);

  const bookPart = Math.min(bookMonthly, bookRemaining);

  // classic mode — no replacement target ⇒ pure straight-line depreciation
  if (target <= 0 || !totalMonths || !startMonth || !lifeEndMonth) {
    return {
      book: bookPart,
      fund: 0,
      total: bookPart,
      target: 0,
      monthsRemaining: monthsToEnd,
      startMonth,
      lifeEndMonth,
      totalMonths: null,
    };
  }

  // months of life left, counting the month being posted
  const monthStart = input.monthStart ?? firstOfMonth(new Date());
  const monthsLeft = monthsBetween(monthStart, lifeEndMonth);
  if (monthsLeft <= 0) {
    // life is over — nothing more to charge
    return {
      book: 0,
      fund: 0,
      total: 0,
      target,
      monthsRemaining: 0,
      startMonth,
      lifeEndMonth,
      totalMonths,
    };
  }

  // what the book part will still contribute over the remaining life
  const expectedBook = Math.min(bookRemaining, bookMonthly * monthsLeft);

  // whatever is still missing from the target is spread over the months left
  const missing = target - accumulatedTotal - expectedBook;
  const fundMonthly = missing > 0 ? Math.max(0, Math.round(missing / monthsLeft)) : 0;

  return {
    book: bookPart,
    fund: fundMonthly,
    total: bookPart + fundMonthly,
    target,
    monthsRemaining: monthsToEnd,
    startMonth,
    lifeEndMonth,
    totalMonths,
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

/**
 * The asset's kind (vehicle type or equipment category) and its reference
 * year (manufacture / commissioning year) — both feed the life presets and
 * the renewal target.
 */
async function kindAndReferenceYearFor(
  tenantId: string,
  source: DepreciationSource,
  vehicleId: string | null | undefined,
  equipmentId: string | null | undefined
): Promise<{ kind: string | null; referenceYear: number | null }> {
  if (source === "vehicle") {
    const [v] = await db
      .select({ type: fleetVehicles.vehicleType, year: fleetVehicles.year })
      .from(fleetVehicles)
      .where(and(eq(fleetVehicles.id, vehicleId ?? ""), eq(fleetVehicles.tenantId, tenantId)));
    return { kind: (v?.type as string) ?? null, referenceYear: v?.year ?? null };
  }
  const [e] = await db
    .select({ category: equipment.category, commissionedAt: equipment.commissionedAt })
    .from(equipment)
    .where(and(eq(equipment.id, equipmentId ?? ""), eq(equipment.tenantId, tenantId)));
  return {
    kind: (e?.category as string) ?? null,
    referenceYear: e?.commissionedAt ? Number(String(e.commissionedAt).slice(0, 4)) : null,
  };
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

  const settings = await getDepreciationSettings(tenantId);
  const inflation =
    input.inflationRatePct !== undefined && input.inflationRatePct !== null
      ? input.inflationRatePct
      : num(settings.defaultInflationRatePct);

  const { kind, referenceYear } = await kindAndReferenceYearFor(
    tenantId,
    input.source,
    input.vehicleId,
    input.equipmentId
  );

  const draft = {
    purchaseDate: input.purchaseDate ? toDateString(input.purchaseDate) : null,
    replacementCostEstSar: input.replacementCostEstSar ?? 0,
    lifeSource: input.lifeSource ?? "manual",
    usefulLifeYears: input.usefulLifeYears ?? null,
  };
  const life = resolveUsefulLife(draft, kind, referenceYear);

  // the renewal target is FROZEN here — price of a new unit today, grown by
  // inflation until the end of this asset's life.
  const replacementTargetSar = computeReplacementTarget(draft, referenceYear, life, inflation);

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
      usefulLifeYears: input.usefulLifeYears ?? null,
      lifeSource: input.lifeSource ?? "manual",
      replacementCostEstSar: input.replacementCostEstSar ?? 0,
      inflationRatePct: String(inflation),
      assessmentValueSar: input.assessmentValueSar ?? 0,
      replacementSource: input.replacementSource ?? null,
      replacementTargetSar,
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
  if (input.usefulLifeYears !== undefined) patch.usefulLifeYears = input.usefulLifeYears;
  if (input.lifeSource !== undefined) patch.lifeSource = input.lifeSource;
  if (input.replacementCostEstSar !== undefined) patch.replacementCostEstSar = input.replacementCostEstSar;
  if (input.inflationRatePct !== undefined) patch.inflationRatePct = String(input.inflationRatePct);
  if (input.assessmentValueSar !== undefined) patch.assessmentValueSar = input.assessmentValueSar;
  if (input.replacementSource !== undefined) patch.replacementSource = input.replacementSource;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.isActive !== undefined) patch.isActive = input.isActive;

  // ── the renewal target is re-frozen whenever its inputs change ──
  const targetInputs = ["purchaseDate", "usefulLifeYears", "lifeSource", "replacementCostEstSar", "inflationRatePct"];
  if (targetInputs.some((k) => input[k as keyof typeof input] !== undefined)) {
    const settings = await getDepreciationSettings(tenantId);
    const inflation =
      input.inflationRatePct !== undefined && input.inflationRatePct !== null
        ? input.inflationRatePct
        : existing.inflationRatePct !== null && existing.inflationRatePct !== undefined
          ? num(existing.inflationRatePct)
          : num(settings.defaultInflationRatePct);

    const { kind, referenceYear } = await kindAndReferenceYearFor(
      tenantId,
      existing.source as DepreciationSource,
      existing.vehicleId,
      existing.equipmentId
    );

    const draft = {
      purchaseDate:
        input.purchaseDate !== undefined
          ? input.purchaseDate
            ? toDateString(input.purchaseDate)
            : null
          : existing.purchaseDate
            ? String(existing.purchaseDate)
            : null,
      replacementCostEstSar:
        input.replacementCostEstSar !== undefined
          ? input.replacementCostEstSar
          : num(existing.replacementCostEstSar),
      lifeSource:
        input.lifeSource !== undefined
          ? input.lifeSource
          : (existing.lifeSource as DepreciationLifeSource | null) ?? "manual",
      usefulLifeYears:
        input.usefulLifeYears !== undefined
          ? input.usefulLifeYears
          : existing.usefulLifeYears ?? null,
    };
    const life = resolveUsefulLife(draft, kind, referenceYear);
    patch.replacementTargetSar = computeReplacementTarget(draft, referenceYear, life, inflation);
  }

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

/** Safety net — never post more than this many catch-up months per run. */
const MAX_CATCHUP_MONTHS = 240;

export async function runDepreciation(
  tenantId: string,
  createdById: string,
  period: Date
) {
  const periodMonth = firstOfMonth(period);

  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(depreciationAssets)
      .where(and(eq(depreciationAssets.tenantId, tenantId), eq(depreciationAssets.isActive, true)))
      .orderBy(asc(depreciationAssets.assetLabel));

    const settingsRows = await tx
      .select()
      .from(depreciationSettings)
      .where(eq(depreciationSettings.tenantId, tenantId))
      .limit(1);
    const inflationDefault = settingsRows.length ? num(settingsRows[0].defaultInflationRatePct) : 3;

    let created = 0;
    let skippedExisting = 0;
    let skippedNotOwned = 0;
    let skippedFully = 0;
    let catchUpMonths = 0;
    let totalPostedSar = 0;
    let totalBookSar = 0;
    let totalFundSar = 0;

    for (const a of rows) {
      const asset = a as any;

      // Not owned yet in that period → nothing to depreciate.
      if (a.purchaseDate && periodMonth < firstOfMonth(new Date(String(a.purchaseDate)))) {
        skippedNotOwned++;
        continue;
      }

      // kind + reference year drive the type defaults
      let kind: string | null = null;
      let referenceYear: number | null = null;
      if (asset.source === "vehicle" && asset.vehicleId) {
        const [v] = await tx
          .select({ type: fleetVehicles.vehicleType, year: fleetVehicles.year })
          .from(fleetVehicles)
          .where(eq(fleetVehicles.id, asset.vehicleId))
          .limit(1);
        kind = v?.type ?? null;
        referenceYear = v?.year ?? null;
      } else if (asset.source === "equipment" && asset.equipmentId) {
        const [e] = await tx
          .select({ category: equipment.category, commissionedAt: equipment.commissionedAt })
          .from(equipment)
          .where(eq(equipment.id, asset.equipmentId))
          .limit(1);
        kind = e?.category ?? null;
        referenceYear = e?.commissionedAt ? Number(String(e.commissionedAt).slice(0, 4)) : null;
      }

      const life = resolveUsefulLife(asset, kind, referenceYear);
      const inflation =
        asset.inflationRatePct !== null && asset.inflationRatePct !== undefined
          ? num(asset.inflationRatePct)
          : inflationDefault;

      const accumAgg = await tx
        .select({
          total: sql<number>`coalesce(sum(${depreciationEntries.amountSar}), 0)`,
          book: sql<number>`coalesce(sum(${depreciationEntries.bookAmountSar}), 0)`,
          count: sql<number>`count(*)`,
          firstMonth: sql<string>`min(${depreciationEntries.periodMonth}::text)`,
        })
        .from(depreciationEntries)
        .where(and(eq(depreciationEntries.tenantId, tenantId), eq(depreciationEntries.assetId, asset.id)));
      const accumulated = Number(accumAgg[0]?.total ?? 0);
      const accumulatedBook = Number(accumAgg[0]?.book ?? 0);
      const postedMonths = Number(accumAgg[0]?.count ?? 0);

      const plan = planMonthly({
        asset,
        kind,
        referenceYear,
        life,
        inflation,
        accumulatedBook,
        accumulatedTotal: accumulated,
        monthStart: periodMonth,
      });

      if (plan.total <= 0 && plan.target <= 0) {
        skippedFully++;
        continue;
      }

      // months we should have posted so far (catch-up for a missed period)
      const startMonth = plan.startMonth ?? periodMonth;
      let dueMonths = monthsBetween(startMonth, periodMonth) + 1;
      if (plan.totalMonths) dueMonths = Math.min(dueMonths, plan.totalMonths);
      dueMonths = Math.max(1, Math.min(dueMonths, MAX_CATCHUP_MONTHS));

      const missing = Math.max(0, dueMonths - postedMonths);
      if (missing === 0) {
        skippedExisting++;
        continue;
      }

      // post the missing months (oldest first) — each month has its own row
      let runningBook = accumulatedBook;
      let runningTotal = accumulated;
      for (let i = 0; i < missing; i++) {
        const monthOffset = postedMonths + i;
        const monthStart = addMonths(startMonth, monthOffset);
        if (monthStart > periodMonth) break;

        const [already] = await tx
          .select({ id: depreciationEntries.id })
          .from(depreciationEntries)
          .where(
            and(
              eq(depreciationEntries.tenantId, tenantId),
              eq(depreciationEntries.assetId, asset.id),
              eq(depreciationEntries.periodMonth, monthStart)
            )
          )
          .limit(1);
        if (already) {
          skippedExisting++;
          continue;
        }

        // recompute the split against the running balances
        const monthlyPlan = planMonthly({
          asset,
          kind,
          referenceYear,
          life,
          inflation,
          accumulatedBook: runningBook,
          accumulatedTotal: runningTotal,
          monthStart,
        });
        const amount = monthlyPlan.total;
        if (amount <= 0) {
          skippedFully++;
          continue;
        }
        runningBook += monthlyPlan.book;
        runningTotal += amount;

        const [entry] = await tx
          .insert(depreciationEntries)
          .values({
            tenantId,
            assetId: asset.id,
            periodMonth: monthStart,
            amountSar: amount,
            bookAmountSar: monthlyPlan.book,
            createdById,
          })
          .returning();

        const [ledger] = await tx
          .insert(ledgerEntries)
          .values({
            tenantId,
            date: new Date(monthStart),
            description: `إهلاك ${asset.assetLabel} — ${monthStart.slice(0, 7)}`,
            amountSar: amount,
            transactionType: "expense",
            referenceNumber: `DEP-${monthStart.slice(0, 7)}`,
            counterpartyType: "asset",
            counterpartyId: asset.id,
            counterpartyName: asset.assetLabel,
            createdById,
          })
          .returning();

        await tx
          .update(depreciationEntries)
          .set({ ledgerEntryId: ledger.id })
          .where(eq(depreciationEntries.id, entry.id));

        created++;
        catchUpMonths++;
        totalPostedSar += amount;
        totalBookSar += monthlyPlan.book;
        totalFundSar += amount - monthlyPlan.book;
      }
    }

    return {
      periodMonth: periodMonth.slice(0, 7),
      created,
      skippedExisting,
      skippedNotOwned,
      skippedFully,
      catchUpMonths,
      totalPostedSar,
      totalBookSar,
      totalFundSar,
    };
  });
}
