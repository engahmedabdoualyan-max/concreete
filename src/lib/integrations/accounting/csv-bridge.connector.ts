/**
 * CSV Bridge connector (Epic 6) — the SAP / Oracle mid-market reality.
 *
 * Most SAP Business One / Oracle NetSuite rollouts at ready-mix scale
 * ingest via scheduled CSV (DTW / CSV Import). This connector:
 *   • testConnection → always ready (no credentials needed)
 *   • pushCustomer / pushInvoice → recorded as PENDING_EXPORT rows that
 *     the bulk CSV export endpoint picks up
 *   • exportCustomersCsv / exportInvoicesCsv → file content for download
 *     and hand-off to the SAP/Oracle import job
 */

import type {
  AccountingConnector,
  ConnectorResult,
  InvoiceLine,
  PushCustomerInput,
} from "./connector";

function csvCell(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface CsvCustomerRow extends PushCustomerInput {
  clientCode: string;
}

export interface CsvInvoiceRow {
  orderNumber: string;
  customerName: string;
  siteName: string;
  mix: string;
  deliveredM3: number;
  pricePerM3Sar: number;
  totalSar: number;
  issueDate: string;
  currency: string;
}

export function exportCustomersCsv(rows: CsvCustomerRow[]): string {
  const head = "client_code,company_name,contact_person,phone,email,vat_number";
  const lines = rows.map((r) =>
    [
      csvCell(r.clientCode),
      csvCell(r.companyName),
      csvCell(r.contactPerson ?? ""),
      csvCell(r.phone ?? ""),
      csvCell(r.email ?? ""),
      csvCell(r.vatNumber ?? ""),
    ].join(",")
  );
  return [head, ...lines].join("\n");
}

export function exportInvoicesCsv(rows: CsvInvoiceRow[]): string {
  const head =
    "order_number,customer_name,site_name,mix,delivered_m3,price_per_m3_sar,total_sar,issue_date,currency";
  const lines = rows.map((r) =>
    [
      csvCell(r.orderNumber),
      csvCell(r.customerName),
      csvCell(r.siteName),
      csvCell(r.mix),
      csvCell(r.deliveredM3),
      csvCell(r.pricePerM3Sar),
      csvCell(r.totalSar),
      csvCell(r.issueDate),
      csvCell(r.currency),
    ].join(",")
  );
  return [head, ...lines].join("\n");
}

export function invoiceLinesCsv(
  orderNumber: string,
  lines: InvoiceLine[],
  currency: string
): string {
  const head = "order_number,description,quantity_m3,rate_sar,amount_sar,currency";
  const rows = lines.map((l) =>
    [
      csvCell(orderNumber),
      csvCell(l.description),
      csvCell(l.quantityM3),
      csvCell(l.rateSar),
      csvCell(Math.round(l.quantityM3 * l.rateSar * 100) / 100),
      csvCell(currency),
    ].join(",")
  );
  return [head, ...rows].join("\n");
}

export const csvBridgeConnector: AccountingConnector = {
  provider: "CSV_BRIDGE",

  async testConnection(): Promise<ConnectorResult> {
    return { ok: true, message: "CSV bridge ready — use bulk export for SAP/Oracle" };
  },

  async pushCustomer(_creds, _settings, input): Promise<ConnectorResult> {
    // Single pushes are queued into the next bulk export (logged by service)
    return {
      ok: true,
      externalId: `CSV:${input.companyName}`,
      message: "Queued for next CSV export",
    };
  },

  async pushInvoice(_creds, _settings, input): Promise<ConnectorResult> {
    return {
      ok: true,
      externalId: `CSV:${input.orderNumber}`,
      message: "Queued for next CSV export",
    };
  },
};
