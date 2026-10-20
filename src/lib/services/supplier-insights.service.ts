/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  ذكاء الموردين — مقارنة الأسعار والأولوية
 * ============================================================
 *  Everything here is derived from purchase-order line items — the
 *  money already spent — so no extra data entry is required:
 *
 *    لكل مادة (أسمنت/رمل/…) → كل مورديها بنفس مجال العمل، مع
 *    آخر سعر شُني عليه · المتوسط المرجّح · أدنى/أعلى · عدد المشتريات
 *    ثم ترتيب أولوية 🥇 (الأقل سعراً أولاً) ونسبة الفرق عن أفضل سعر.
 *
 *  Suppliers are also ranked overall: مواد كم فاز فيها بالمركز الأول
 *  ومتوسط فرقه عن أفضل سعر — «الأولوية» على كارت المورد.
 * ============================================================
 */

import { db } from "@/db";
import { purchaseOrderItems, purchaseOrders, suppliers } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MaterialSupplierRow {
  supplierId: string;
  supplierName: string;
  supplierCategory: string | null;
  purchaseCount: number;
  totalQtyKg: number;
  totalSar: number;
  /** آخر سعر شُني عليه (أحدث أمر شراء) — SAR cents/kg */
  latestRateSar: number | null;
  /** المتوسط المرجّح = إجمالي القيمة ÷ إجمالي الكمية */
  avgRateSar: number | null;
  minRateSar: number | null;
  maxRateSar: number | null;
  lastDate: string | null;
  /** 1 = الأقل سعراً في هذه المادة */
  priority: number;
  /** نسبة الفرق عن أفضل سعر (latest) — 0 = هو الأفضل */
  diffPctBest: number | null;
  isFocusSupplier: boolean;
}

export interface MaterialGroup {
  materialCategory: string;
  supplierCount: number;
  bestRateSar: number | null;
  rows: MaterialSupplierRow[];
}

export interface SupplierProfileRow {
  supplierId: string;
  supplierName: string;
  supplierCategory: string | null;
  materialsCount: number;
  /** في كم مادة هو الأفضل سعراً */
  bestCount: number;
  /** متوسط فرقه عن أفضل سعر عبر المواد (%) */
  avgDiffPct: number | null;
  totalSar: number;
  /** 1 = الأولوية القصوى (أفضل قيمة مقابل السعر) */
  priorityRank: number;
  isFocusSupplier: boolean;
}

export interface PriceComparisonResult {
  materials: MaterialGroup[];
  supplierProfile: SupplierProfileRow[];
  categories: string[];
  focusSupplierId: string | null;
}

export interface PriceComparisonOptions {
  materialCategory?: string | null;
  /** قارن أسعار مورد معيّن مقابل موردي نفس المواد */
  supplierId?: string | null;
  /** قسّم/فلتر على موردي مجال عمل واحد */
  category?: string | null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function priceComparison(
  tenantId: string,
  opts: PriceComparisonOptions = {}
): Promise<PriceComparisonResult> {
  const lines = await db
    .select({
      itemId: purchaseOrderItems.id,
      materialCategory: purchaseOrderItems.materialCategory,
      quantityKg: purchaseOrderItems.quantityKg,
      ratePerKgSar: purchaseOrderItems.ratePerKgSar,
      lineTotalSar: purchaseOrderItems.lineTotalSar,
      poId: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      purchaseDate: purchaseOrders.purchaseDate,
      supplierId: suppliers.id,
      supplierName: suppliers.name,
      supplierCategory: suppliers.category,
    })
    .from(purchaseOrderItems)
    .innerJoin(purchaseOrders, eq(purchaseOrderItems.purchaseOrderId, purchaseOrders.id))
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .where(
      and(
        eq(purchaseOrderItems.tenantId, tenantId),
        eq(purchaseOrders.tenantId, tenantId),
        sql`${purchaseOrders.status} <> 'CANCELLED'`
      )
    );

  // ── focus filter: which materials are we comparing? ──
  const focusSuppliers = opts.supplierId
    ? new Set([opts.supplierId])
    : opts.category
      ? new Set(lines.filter((l) => l.supplierCategory === opts.category).map((l) => l.supplierId))
      : null;
  const focusMaterials = focusSuppliers
    ? new Set(
        lines.filter((l) => focusSuppliers.has(l.supplierId)).map((l) => l.materialCategory)
      )
    : null;

  // ── group: materialCategory → supplier → aggregates ──
  type Agg = {
    supplierId: string;
    supplierName: string;
    supplierCategory: string | null;
    pos: Set<string>;
    totalQtyKg: number;
    totalSar: number;
    latestRateSar: number | null;
    latestDate: string | null;
    minRateSar: number | null;
    maxRateSar: number | null;
  };
  const byMaterial = new Map<string, Map<string, Agg>>();

  for (const l of lines) {
    if (focusMaterials && !focusMaterials.has(l.materialCategory)) continue;
    if (opts.materialCategory && l.materialCategory !== opts.materialCategory) continue;

    let suppliersOfMaterial = byMaterial.get(l.materialCategory);
    if (!suppliersOfMaterial) {
      suppliersOfMaterial = new Map();
      byMaterial.set(l.materialCategory, suppliersOfMaterial);
    }
    let agg = suppliersOfMaterial.get(l.supplierId);
    if (!agg) {
      agg = {
        supplierId: l.supplierId,
        supplierName: l.supplierName,
        supplierCategory: l.supplierCategory,
        pos: new Set(),
        totalQtyKg: 0,
        totalSar: 0,
        latestRateSar: null,
        latestDate: null,
        minRateSar: null,
        maxRateSar: null,
      };
      suppliersOfMaterial.set(l.supplierId, agg);
    }

    const qty = Number(l.quantityKg) || 0;
    agg.pos.add(l.poId);
    agg.totalQtyKg += qty;
    agg.totalSar += l.lineTotalSar;
    const rate = l.ratePerKgSar;
    agg.minRateSar = agg.minRateSar === null ? rate : Math.min(agg.minRateSar, rate);
    agg.maxRateSar = agg.maxRateSar === null ? rate : Math.max(agg.maxRateSar, rate);
    if (!agg.latestDate || l.purchaseDate > agg.latestDate) {
      agg.latestDate = l.purchaseDate;
      agg.latestRateSar = rate;
    }
  }

  // ── rank per material (latest price asc, tie-break avg asc) ──
  const materials: MaterialGroup[] = [];
  const profileAcc = new Map<
    string,
    { name: string; category: string | null; best: number; total: number; diffs: number[]; totalSar: number }
  >();

  for (const [materialCategory, suppliersOfMaterial] of [...byMaterial.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  )) {
    const aggs = [...suppliersOfMaterial.values()];
    aggs.sort((a, b) => {
      const ra = a.latestRateSar ?? Number.MAX_SAFE_INTEGER;
      const rb = b.latestRateSar ?? Number.MAX_SAFE_INTEGER;
      if (ra !== rb) return ra - rb;
      const aa = a.totalQtyKg ? a.totalSar / a.totalQtyKg : Number.MAX_SAFE_INTEGER;
      const ab = b.totalQtyKg ? b.totalSar / b.totalQtyKg : Number.MAX_SAFE_INTEGER;
      return aa - ab;
    });

    const bestRate = aggs.length && aggs[0].latestRateSar !== null ? aggs[0].latestRateSar : null;

    const rows: MaterialSupplierRow[] = aggs.map((a, i) => {
      const avg = a.totalQtyKg > 0 ? Math.round(a.totalSar / a.totalQtyKg) : null;
      const diff =
        bestRate !== null && a.latestRateSar !== null && bestRate > 0
          ? Math.round(((a.latestRateSar - bestRate) / bestRate) * 1000) / 10
          : null;

      const prof = profileAcc.get(a.supplierId) ?? {
        name: a.supplierName,
        category: a.supplierCategory,
        best: 0,
        total: 0,
        diffs: [],
        totalSar: 0,
      };
      prof.total += 1;
      if (i === 0) prof.best += 1;
      if (diff !== null) prof.diffs.push(diff);
      prof.totalSar += a.totalSar;
      profileAcc.set(a.supplierId, prof);

      return {
        supplierId: a.supplierId,
        supplierName: a.supplierName,
        supplierCategory: a.supplierCategory,
        purchaseCount: a.pos.size,
        totalQtyKg: Math.round(a.totalQtyKg),
        totalSar: a.totalSar,
        latestRateSar: a.latestRateSar,
        avgRateSar: avg,
        minRateSar: a.minRateSar,
        maxRateSar: a.maxRateSar,
        lastDate: a.latestDate,
        priority: i + 1,
        diffPctBest: diff,
        isFocusSupplier: focusSuppliers ? focusSuppliers.has(a.supplierId) : false,
      };
    });

    materials.push({
      materialCategory,
      supplierCount: rows.length,
      bestRateSar: bestRate,
      rows,
    });
  }

  // ── overall supplier priority: more wins first, then lower avg diff ──
  const supplierProfile: SupplierProfileRow[] = [...profileAcc.entries()]
    .map(([supplierId, p]) => ({
      supplierId,
      supplierName: p.name,
      supplierCategory: p.category,
      materialsCount: p.total,
      bestCount: p.best,
      avgDiffPct: p.diffs.length
        ? Math.round((p.diffs.reduce((s, d) => s + d, 0) / p.diffs.length) * 10) / 10
        : null,
      totalSar: p.totalSar,
      priorityRank: 0,
      isFocusSupplier: focusSuppliers ? focusSuppliers.has(supplierId) : false,
    }))
    .sort((a, b) => {
      if (b.bestCount !== a.bestCount) return b.bestCount - a.bestCount;
      const da = a.avgDiffPct ?? Number.MAX_SAFE_INTEGER;
      const db_ = b.avgDiffPct ?? Number.MAX_SAFE_INTEGER;
      if (da !== db_) return da - db_;
      return b.totalSar - a.totalSar;
    })
    .map((row, i) => ({ ...row, priorityRank: i + 1 }));

  const categories = [...new Set(lines.map((l) => l.supplierCategory).filter((c): c is string => !!c))].sort();

  return {
    materials,
    supplierProfile,
    categories,
    focusSupplierId: opts.supplierId ?? null,
  };
}
