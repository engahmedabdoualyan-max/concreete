/**
 * ============================================================
 *  Fimto Soft — Multi-Tenant Reporting & Integration Engine
 * ============================================================
 *
 * Hard rule: every query is scoped by tenant_id unless SUPER_ADMIN explicitly
 * requests global analytics through a trusted context.
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";
import * as XLSX from "xlsx";
// PDFKit is intentionally not used at runtime in this sandbox because its
// default font files may be unavailable in serverless deployments. We generate
// a standards-compliant minimal PDF buffer directly below.
import QRCode from "qrcode";
import crypto from "crypto";
import { customAlphabet } from "nanoid";
import type { TenantContext } from "@/lib/tenant";
import { assertTenantId, enforceTenantAnalytics } from "@/lib/tenant";

const nanoid = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz", 10);

export type ReportLocale = "en" | "ar" | "ur" | "hi";
export type ReportType = "FLEET" | "FUEL" | "SILOS" | "QUALITY" | "DISPATCH";

export interface ReportFilters {
  tenantId: string;
  from: string;
  to: string;
  vehicleTypes?: string[];
  mixDesignIds?: string[];
  driverIds?: string[];
  locale?: ReportLocale;
}

export interface GeneratedReport {
  reportId: string;
  tenantId: string;
  type: ReportType;
  mimeType: string;
  filename: string;
  buffer: Buffer;
  shareUrl: string;
  whatsappUrl: string;
}

const I18N: Record<ReportLocale, Record<string, string>> = {
  en: {
    title: "Fimto Concrete ERP Report",
    fleet: "Fleet Operations",
    fuel: "Fuel Metrics",
    silos: "Material Silos",
    generated: "Generated",
    period: "Period",
    tenant: "Tenant",
  },
  ar: {
    title: "تقرير فيمتو لإدارة الخرسانة",
    fleet: "عمليات الأسطول",
    fuel: "مؤشرات الوقود",
    silos: "صوامع المواد",
    generated: "تاريخ الإنشاء",
    period: "الفترة",
    tenant: "المستأجر",
  },
  ur: {
    title: "فیمٹو کنکریٹ ERP رپورٹ",
    fleet: "فلیٹ آپریشنز",
    fuel: "ایندھن میٹرکس",
    silos: "مٹیریل سائلوز",
    generated: "تیار شدہ",
    period: "مدت",
    tenant: "ٹیننٹ",
  },
  hi: {
    title: "फिम्तो कंक्रीट ERP रिपोर्ट",
    fleet: "फ्लीट संचालन",
    fuel: "ईंधन मेट्रिक्स",
    silos: "सामग्री साइलो",
    generated: "निर्मित",
    period: "अवधि",
    tenant: "टेनेंट",
  },
};

function rtl(locale: ReportLocale): boolean {
  return locale === "ar" || locale === "ur";
}

function makeMinimalPdf(lines: string[]): Buffer {
  const escape = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[^\x20-\x7E]/g, "?")
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");
  const content = ["BT", "/F1 10 Tf", "50 790 Td"];
  lines.slice(0, 80).forEach((line, i) => {
    if (i > 0) content.push("0 -14 Td");
    content.push(`(${escape(line)}) Tj`);
  });
  content.push("ET");
  const stream = content.join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream endobj`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += obj + "\n";
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "binary");
}

function signPayload(payload: unknown): string {
  const configured = process.env.WEBHOOK_SIGNING_SECRET;
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("WEBHOOK_SIGNING_SECRET must be configured in production");
  }
  const secret = configured ?? "fimto-dev-webhook-secret";
  return crypto.createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex");
}

export async function collectReportData(ctx: TenantContext, filters: ReportFilters) {
  const tenantId = assertTenantId(filters.tenantId || ctx.tenantId);
  if (tenantId !== ctx.tenantId && ctx.role !== "SUPER_ADMIN") {
    throw new Error("TENANT_FORBIDDEN: requested tenant_id does not match JWT context");
  }

  const from = filters.from;
  const to = filters.to;
  const vehicleTypeFilter = filters.vehicleTypes?.length
    ? sql`AND fv.vehicle_type::text IN (${sql.join(filters.vehicleTypes.map((v) => sql`${v}`), sql`, `)})`
    : sql``;

  const fleet = await db.execute(sql`
    SELECT fv.vehicle_code, fv.plate_number, fv.vehicle_class, fv.vehicle_type,
           COUNT(t.id)::int AS trips,
           COALESCE(SUM(CAST(t.loaded_volume_m3 AS DECIMAL)),0)::text AS volume_m3,
           COALESCE(AVG(t.total_cycle_time_minutes),0)::text AS avg_cycle_min
    FROM fleet_vehicles fv
    LEFT JOIN trips t ON t.vehicle_id = fv.id AND t.created_at BETWEEN ${from}::timestamp AND ${to}::timestamp
    WHERE fv.tenant_id = ${tenantId}
      ${vehicleTypeFilter}
    GROUP BY fv.id
    ORDER BY fv.vehicle_code
  `);

  const fuel = await db.execute(sql`
    SELECT fv.vehicle_code, fv.vehicle_class,
           COALESCE(SUM(CAST(fl.litres_added AS DECIMAL)),0)::text AS litres,
           COALESCE(SUM(CAST(fl.distance_travelled_km AS DECIMAL)),0)::text AS distance_km,
           COALESCE(SUM(fl.total_fuel_cost_sar),0)::int AS cost_sar,
           SUM(CASE WHEN fl.is_anomaly THEN 1 ELSE 0 END)::int AS anomalies
    FROM fuel_logs fl
    JOIN fleet_vehicles fv ON fv.id = fl.vehicle_id
    WHERE fl.tenant_id = ${tenantId}
      AND fl.logged_at BETWEEN ${from}::timestamp AND ${to}::timestamp
    GROUP BY fv.vehicle_code, fv.vehicle_class
    ORDER BY anomalies DESC, cost_sar DESC
  `);

  const silos = await db.execute(sql`
    SELECT silo_code, silo_name, material_category,
           current_stock_kg, capacity_kg, reorder_level_kg,
           CASE WHEN CAST(current_stock_kg AS DECIMAL) <= CAST(reorder_level_kg AS DECIMAL) THEN true ELSE false END AS below_reorder
    FROM inventory_silos
    WHERE tenant_id = ${tenantId}
    ORDER BY material_category, silo_code
  `);

  return { fleet: fleet.rows, fuel: fuel.rows, silos: silos.rows };
}

const MAX_REPORT_ROWS = 10_000;
const MAX_REPORT_CELL_LENGTH = 2_000;

function safeReportRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_REPORT_ROWS).map((row) => {
    if (!row || typeof row !== "object") return { value: safeReportCell(row) };
    const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [key, cell] of Object.entries(row as Record<string, unknown>).slice(0, 200)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
      out[key] = safeReportCell(cell);
    }
    return out;
  });
}

function safeReportCell(value: unknown): unknown {
  if (typeof value === "string") return value.slice(0, MAX_REPORT_CELL_LENGTH);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (value instanceof Date) return value.toISOString();
  return String(value).slice(0, MAX_REPORT_CELL_LENGTH);
}

export async function generateExcelReport(ctx: TenantContext, filters: ReportFilters): Promise<GeneratedReport> {
  const tenantId = enforceTenantAnalytics(ctx) ?? filters.tenantId;
  const data = await collectReportData(ctx, { ...filters, tenantId });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(safeReportRows(data.fleet)), "Fleet Operations");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(safeReportRows(data.fuel)), "Fuel Metrics");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(safeReportRows(data.silos)), "Material Silos");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return wrapReport("FLEET", tenantId, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "fimto-operations.xlsx", buffer);
}

export async function generatePdfReport(ctx: TenantContext, filters: ReportFilters): Promise<GeneratedReport> {
  const tenantId = enforceTenantAnalytics(ctx) ?? filters.tenantId;
  const locale = filters.locale ?? "en";
  const dict = I18N[locale];
  const data = await collectReportData(ctx, { ...filters, tenantId });
  const qrDataUrl = await QRCode.toDataURL(`fimto://report/${tenantId}/${filters.from}/${filters.to}`);

  const lines: string[] = [];
  lines.push(dict.title);
  lines.push(`${dict.period}: ${filters.from} -> ${filters.to}`);
  lines.push(`${dict.generated}: ${new Date().toISOString()}`);
  lines.push("");
  lines.push(dict.fleet);
  (data.fleet as any[]).slice(0, 20).forEach((r) => {
    lines.push(`${r.vehicle_code} | ${r.vehicle_class} | trips ${r.trips} | ${r.volume_m3} m3`);
  });
  lines.push("");
  lines.push(dict.fuel);
  (data.fuel as any[]).slice(0, 20).forEach((r) => {
    lines.push(`${r.vehicle_code} | ${r.litres} L | ${r.distance_km} km | anomalies ${r.anomalies}`);
  });
  lines.push("");
  lines.push(dict.silos);
  (data.silos as any[]).slice(0, 20).forEach((r) => {
    lines.push(`${r.silo_code} | ${r.material_category} | ${r.current_stock_kg}/${r.capacity_kg}`);
  });
  lines.push("");
  lines.push(`QR: ${qrDataUrl.slice(0, 72)}...`);

  const buffer = makeMinimalPdf(lines);
  return wrapReport("FLEET", tenantId, "application/pdf", "fimto-report.pdf", buffer);
}

function wrapReport(type: ReportType, tenantId: string, mimeType: string, filename: string, buffer: Buffer): GeneratedReport {
  const reportId = nanoid();
  const base = process.env.PUBLIC_BASE_URL ?? "https://fimtosoft.com";
  const shareUrl = `${base}/api/reports/share/${reportId}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`Fimto ERP Report: ${shareUrl}`)}`;
  reportCache.set(reportId, { buffer, mimeType, filename, tenantId, expiresAt: Date.now() + 24 * 3600_000 });
  return { reportId, tenantId, type, mimeType, filename, buffer, shareUrl, whatsappUrl };
}

export const reportCache = new Map<string, { buffer: Buffer; mimeType: string; filename: string; tenantId: string; expiresAt: number }>();

export async function pushSignedOperationalEvent(event: string, tenantId: string, payload: Record<string, unknown>) {
  const body = { event, tenantId, payload, occurredAt: new Date().toISOString() };
  const signature = signPayload(body);
  await db.execute(sql`
    INSERT INTO audit_logs (id, tenant_id, action, entity_type, new_state, created_at)
    VALUES (gen_random_uuid(), ${tenantId}, ${`WEBHOOK_${event}`}, 'integration', ${JSON.stringify({ body, signature })}::jsonb, now())
  `);
  return { body, signature, destinations: ["SAP", "Oracle", "Odoo", "Microsoft Dynamics"] };
}

export async function verifyEnterpriseApiKey(apiKey: string): Promise<{ tenantId: string; scopes: string[] } | null> {
  const digest = crypto.createHash("sha256").update(apiKey).digest("hex");
  const rows = await db.execute(sql`
    SELECT tenant_id, permissions FROM users
    WHERE permissions::jsonb ? ${`api_key:${digest}`}
    LIMIT 1
  `);
  if (!rows.rows.length) return null;
  const row = rows.rows[0] as { tenant_id: string; permissions: string[] };
  return { tenantId: row.tenant_id, scopes: row.permissions ?? [] };
}
