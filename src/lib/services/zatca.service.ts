/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  ZATCA Phase-2 Service (Epic 7 — Competitive Parity)
 * ============================================================
 *
 *  Full Fatoora flow (iCeipts / ERPGulf parity):
 *   1. Taxpayer config lives in tenants.settings.zatca
 *      (secrets AES-encrypted via the accounting crypto helpers)
 *   2. issueInvoice builds the current UBL/QR fallback, chains counters,
 *      and submits through Fatoora. The returned Fatoora QR/status is
 *      preferred; local QR generation alone is not Phase-2 certification.
 *   3. STANDARD (B2B) → clearance API · SIMPLIFIED (B2C) → reporting API.
 *      Without configured production tokens the document is stored as
 *      PENDING (submittable later) instead of failing.
 *
 *  Fatoora developer portal: https://gw-fatoora.zatca.gov.sa
 * ============================================================
 */

import crypto from "node:crypto";
import { db } from "@/db";
import {
  tenants,
  zatcaDocuments,
  orders,
  clients,
  deliverySites,
  mixDesigns,
  auditLogs,
} from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  decryptSecrets,
  encryptSecrets,
} from "../integrations/accounting/connector";
import {
  validateZatcaInvoiceInput,
  zatcaBlockingIssues,
} from "@/lib/zatca/validation";

export const ZATCA_VAT_RATE = 0.15;

const GW = {
  simulation: "https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation",
  production: "https://gw-fatoora.zatca.gov.sa/e-invoicing/core",
};

export interface ZatcaConfig {
  sellerName: string;
  vatNumber: string;
  street?: string;
  city?: string;
  branchName?: string;
  env: "simulation" | "production";
  binaryToken?: string;
  secret?: string;
}

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

// ─── Taxpayer config (tenant.settings.zatca) ──────────────────────────────────

type TenantSettings = Record<string, unknown>;

async function readSettings(tenantId: string): Promise<TenantSettings> {
  const rows = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return ((rows[0]?.settings ?? {}) as TenantSettings) ?? {};
}

export async function getZatcaConfig(
  tenantId: string
): Promise<Omit<ZatcaConfig, "binaryToken" | "secret"> & { configured: boolean }> {
  const settings = await readSettings(tenantId);
  const z = (settings.zatca ?? {}) as Record<string, unknown>;
  let secrets: Record<string, string> = {};
  if (typeof z.credentialsEnc === "string" && z.credentialsEnc) {
    try {
      secrets = decryptSecrets(z.credentialsEnc);
    } catch {
      secrets = {};
    }
  }
  return {
    sellerName: (z.sellerName as string) ?? "",
    vatNumber: (z.vatNumber as string) ?? "",
    street: z.street as string | undefined,
    city: z.city as string | undefined,
    branchName: z.branchName as string | undefined,
    env: z.env === "production" ? "production" : "simulation",
    configured: !!(secrets.binaryToken && secrets.secret && z.sellerName && z.vatNumber),
  };
}

export async function saveZatcaConfig(
  tenantId: string,
  input: Partial<ZatcaConfig>,
  actorUserId?: string
): Promise<void> {
  const settings = await readSettings(tenantId);
  const z = ((settings.zatca ?? {}) as Record<string, unknown>) ?? {};

  // Merge secrets: omitted fields keep previous values
  let prevSecrets: Record<string, string> = {};
  if (typeof z.credentialsEnc === "string" && z.credentialsEnc) {
    try {
      prevSecrets = decryptSecrets(z.credentialsEnc);
    } catch {
      prevSecrets = {};
    }
  }
  const nextSecrets = { ...prevSecrets };
  if (input.binaryToken !== undefined) nextSecrets.binaryToken = input.binaryToken;
  if (input.secret !== undefined) nextSecrets.secret = input.secret;

  const next: Record<string, unknown> = {
    ...z,
    ...(input.sellerName !== undefined ? { sellerName: input.sellerName } : {}),
    ...(input.vatNumber !== undefined ? { vatNumber: input.vatNumber } : {}),
    ...(input.street !== undefined ? { street: input.street } : {}),
    ...(input.city !== undefined ? { city: input.city } : {}),
    ...(input.branchName !== undefined ? { branchName: input.branchName } : {}),
    ...(input.env !== undefined ? { env: input.env } : {}),
  };
  if (nextSecrets.binaryToken || nextSecrets.secret) {
    next.credentialsEnc = encryptSecrets(nextSecrets);
  }

  await db
    .update(tenants)
    .set({ settings: { ...settings, zatca: next }, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId));

  if (actorUserId) {
    try {
      await db.insert(auditLogs).values({
        tenantId,
        userId: actorUserId,
        action: "ZATCA_CONFIG_UPDATED",
        entityType: "tenant_settings",
        entityId: null,
        newState: {
          sellerName: next.sellerName,
          vatNumber: next.vatNumber,
          env: next.env,
          street: next.street,
          city: next.city,
          branchName: next.branchName,
        },
      });
    } catch (error) {
      console.error("[ZATCA] config audit write failed", error);
    }
  }
}

async function recordZatcaAudit(input: {
  tenantId: string;
  userId: string;
  action: string;
  entityId?: string;
  newState: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      tenantId: input.tenantId,
      userId: input.userId,
      action: input.action,
      entityType: "zatca_documents",
      entityId: input.entityId ?? null,
      newState: input.newState,
    });
  } catch (error) {
    console.error("[ZATCA] audit write failed", error);
  }
}

async function loadSecrets(tenantId: string): Promise<{ binaryToken: string; secret: string } | null> {
  const settings = await readSettings(tenantId);
  const z = (settings.zatca ?? {}) as Record<string, unknown>;
  if (typeof z.credentialsEnc !== "string" || !z.credentialsEnc) return null;
  try {
    const s = decryptSecrets(z.credentialsEnc);
    if (s.binaryToken && s.secret) return { binaryToken: s.binaryToken, secret: s.secret };
    return null;
  } catch {
    return null;
  }
}

// ─── TLV QR (Phase-1-compatible, always generated) ────────────────────────────

export function buildTlvBase64(
  sellerName: string,
  vatNumber: string,
  timestampISO: string,
  totalWithVat: number,
  vatAmount: number
): string {
  const parts: [number, string][] = [
    [1, sellerName],
    [2, vatNumber],
    [3, timestampISO],
    [4, fmt(totalWithVat)],
    [5, fmt(vatAmount)],
  ];
  const chunks: number[] = [];
  const enc = new TextEncoder();
  for (const [tag, value] of parts) {
    const v = enc.encode(value);
    if (v.length > 255) throw new Error("TLV value too long");
    chunks.push(tag, v.length, ...v);
  }
  return Buffer.from(chunks).toString("base64");
}

// ─── Minimal UBL 2.1 tax invoice ──────────────────────────────────────────────

export interface UblInput {
  invoiceNumber: string;
  uuid: string;
  issueDate: string; // YYYY-MM-DD
  issueTime: string; // HH:MM:SS
  typeCode: "388" | "383"; // 388 = standard, 383 = simplified
  seller: { name: string; vatNumber: string; street?: string; city?: string };
  buyer: { name: string; vatNumber?: string; street?: string; city?: string };
  lines: { id: string; name: string; quantity: number; unitPrice: number }[];
  currency?: string;
}

export function buildUblXml(input: UblInput): string {
  const currency = input.currency ?? "SAR";
  const exVat = input.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const vat = exVat * ZATCA_VAT_RATE;
  const withVat = exVat + vat;

  const linesXml = input.lines
    .map((l, i) => {
      const lineEx = l.quantity * l.unitPrice;
      const lineVat = lineEx * ZATCA_VAT_RATE;
      return `    <cac:InvoiceLine>
      <cbc:ID>${i + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="M3">${fmt(l.quantity)}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${currency}">${fmt(lineEx)}</cbc:LineExtensionAmount>
      <cac:Item>
        <cbc:Name>${escXml(l.name)}</cbc:Name>
        <cac:ClassifiedTaxCategory>
          <cbc:ID>S</cbc:ID>
          <cbc:Percent>${(ZATCA_VAT_RATE * 100).toFixed(2)}</cbc:Percent>
          <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
        </cac:ClassifiedTaxCategory>
      </cac:Item>
      <cac:Price><cbc:PriceAmount currencyID="${currency}">${fmt(l.unitPrice)}</cbc:PriceAmount></cac:Price>
      <cac:ItemPriceExtension>
        <cbc:Amount currencyID="${currency}">${fmt(lineEx)}</cbc:Amount>
        <cac:TaxTotal>
          <cbc:TaxAmount currencyID="${currency}">${fmt(lineVat)}</cbc:TaxAmount>
        </cac:TaxTotal>
      </cac:ItemPriceExtension>
    </cac:InvoiceLine>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${escXml(input.invoiceNumber)}</cbc:ID>
  <cbc:UUID>${escXml(input.uuid)}</cbc:UUID>
  <cbc:IssueDate>${input.issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${input.issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="0200000">${input.typeCode}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${currency}</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>${currency}</cbc:TaxCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${escXml(input.seller.name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${escXml(input.seller.street ?? "-")}</cbc:StreetName>
        <cbc:CityName>${escXml(input.seller.city ?? "-")}</cbc:CityName>
        <cac:Country><cbc:IdentificationCode>SA</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${escXml(input.seller.vatNumber)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${escXml(input.buyer.name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${escXml(input.buyer.street ?? "-")}</cbc:StreetName>
        <cbc:CityName>${escXml(input.buyer.city ?? "-")}</cbc:CityName>
        <cac:Country><cbc:IdentificationCode>SA</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      ${
        input.buyer.vatNumber
          ? `<cac:PartyTaxScheme>
        <cbc:CompanyID>${escXml(input.buyer.vatNumber)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>`
          : ""
      }
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${currency}">${fmt(vat)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${currency}">${fmt(exVat)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${currency}">${fmt(vat)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${(ZATCA_VAT_RATE * 100).toFixed(2)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${currency}">${fmt(exVat)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${currency}">${fmt(exVat)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${currency}">${fmt(withVat)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${currency}">${fmt(withVat)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${linesXml}
</Invoice>`;
}

export function sha256Base64(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("base64");
}

/** Normalize legacy hex hashes before using them in the base64 PIH chain. */
function normalizeStoredHash(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return Buffer.from(value, "hex").toString("base64");
  }
  return value;
}

function genesisHash(): string {
  return sha256Base64("0");
}

// ─── Fatoora API client ───────────────────────────────────────────────────────

async function fatooraPost(
  env: "simulation" | "production",
  path: "/invoices/clearance/single" | "/invoices/reporting/single",
  binaryToken: string,
  secret: string,
  payload: { invoiceHash: string; uuid: string; invoice: string }
): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  const res = await fetch(`${GW[env]}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Version": "V2",
      "Accept-Language": "en",
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${binaryToken}:${secret}`).toString("base64")}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, body };
}

// ─── Issue flow ───────────────────────────────────────────────────────────────

export type ZatcaIssueType = "STANDARD" | "SIMPLIFIED";

export async function issueInvoice(
  tenantId: string,
  userId: string,
  orderId: string,
  type: ZatcaIssueType = "STANDARD"
) {
  const o = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      totalVolumeM3: orders.totalVolumeM3,
      remainingVolumeM3: orders.remainingVolumeM3,
      pricePerM3Cents: orders.pricePerM3Sar,
      companyName: clients.companyName,
      vatNumber: clients.vatNumber,
      siteName: deliverySites.siteName,
      designCode: mixDesigns.designCode,
    })
    .from(orders)
    .innerJoin(
      clients,
      and(eq(orders.clientId, clients.id), eq(clients.tenantId, tenantId))
    )
    .innerJoin(
      deliverySites,
      and(
        eq(orders.deliverySiteId, deliverySites.id),
        eq(deliverySites.tenantId, tenantId)
      )
    )
    .innerJoin(
      mixDesigns,
      and(eq(orders.mixDesignId, mixDesigns.id), eq(mixDesigns.tenantId, tenantId))
    )
    .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)))
    .limit(1);
  const order = o[0];
  if (!order) throw new Error("Order not found");

  const cfg = await getZatcaConfig(tenantId);
  if (!cfg.sellerName || !cfg.vatNumber) {
    throw new Error("ZATCA taxpayer config missing — set seller name + VAT number first");
  }

  // Counter + previous hash (anti-gap chain)
  const last = await db
    .select({
      counterValue: zatcaDocuments.counterValue,
      invoiceHash: zatcaDocuments.invoiceHash,
    })
    .from(zatcaDocuments)
    .where(eq(zatcaDocuments.tenantId, tenantId))
    .orderBy(desc(zatcaDocuments.counterValue))
    .limit(1);
  const counter = (last[0]?.counterValue ?? 0) + 1;
  const previousHash = normalizeStoredHash(last[0]?.invoiceHash) ?? genesisHash();

  const totalM3 = Number(order.totalVolumeM3 ?? 0);
  const deliveredM3 = Math.max(0, totalM3 - Number(order.remainingVolumeM3 ?? 0));
  const billM3 = deliveredM3 > 0 ? deliveredM3 : totalM3;
  const rateSar = (order.pricePerM3Cents ?? 0) / 100;

  const validationIssues = validateZatcaInvoiceInput({
    sellerName: cfg.sellerName,
    sellerVatNumber: cfg.vatNumber,
    buyerVatNumber: order.vatNumber,
    quantity: billM3,
    unitPriceSar: rateSar,
    kind: type,
  });
  const blockingIssues = zatcaBlockingIssues({
    sellerName: cfg.sellerName,
    sellerVatNumber: cfg.vatNumber,
    buyerVatNumber: order.vatNumber,
    quantity: billM3,
    unitPriceSar: rateSar,
    kind: type,
  });
  if (blockingIssues.length > 0) {
    throw new Error(
      `Invoice validation failed: ${blockingIssues.map((issue) => issue.code).join(", ")}`
    );
  }
  for (const warning of validationIssues.filter((issue) => issue.level === "WARNING")) {
    console.warn(`[ZATCA] ${warning.code}: ${warning.message}`);
  }

  const now = new Date();
  const issueDate = now.toISOString().slice(0, 10);
  const issueTime = now.toISOString().slice(11, 19);
  const uuid = crypto.randomUUID();
  const invoiceNumber = `INV-${now.getFullYear()}-${String(counter).padStart(6, "0")}`;

  const xml = buildUblXml({
    invoiceNumber,
    uuid,
    issueDate,
    issueTime,
    typeCode: type === "STANDARD" ? "388" : "383",
    seller: {
      name: cfg.sellerName,
      vatNumber: cfg.vatNumber,
      street: cfg.street,
      city: cfg.city,
    },
    buyer: {
      name: order.companyName,
      vatNumber: order.vatNumber ?? undefined,
    },
    lines: [
      {
        id: "1",
        name: `${order.designCode} — ${order.siteName} (${billM3} m3)`,
        quantity: billM3,
        unitPrice: rateSar,
      },
    ],
  });
  const hash = sha256Base64(xml);
  const exVat = billM3 * rateSar;
  const vatAmount = exVat * ZATCA_VAT_RATE;
  const qr = buildTlvBase64(
    cfg.sellerName,
    cfg.vatNumber,
    now.toISOString(),
    exVat + vatAmount,
    vatAmount
  );

  const [doc] = await db.transaction(async (tx) => {
    // Serialize counter allocation per tenant. The re-read detects a stale
    // request instead of allowing two invoices to claim the same ICV/PIH.
    await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`);
    const current = await tx
      .select({
        counterValue: zatcaDocuments.counterValue,
        invoiceHash: zatcaDocuments.invoiceHash,
      })
      .from(zatcaDocuments)
      .where(eq(zatcaDocuments.tenantId, tenantId))
      .orderBy(desc(zatcaDocuments.counterValue))
      .limit(1);
    const currentCounter = current[0]?.counterValue ?? 0;
    const expectedCounter = last[0]?.counterValue ?? 0;
    if (
      currentCounter !== expectedCounter ||
      (current[0]?.invoiceHash ?? null) !== (last[0]?.invoiceHash ?? null)
    ) {
      throw new Error("ZATCA_COUNTER_CHANGED: retry invoice creation");
    }

    return tx
      .insert(zatcaDocuments)
      .values({
        tenantId,
        orderId,
        invoiceNumber,
        invoiceUuid: uuid,
        invoiceType: type,
        status: "DRAFT",
        counterValue: counter,
        invoiceHash: hash,
        previousHash,
        qrTlvBase64: qr,
        totals: {
          exVat: Math.round(exVat * 100) / 100,
          vatAmount: Math.round(vatAmount * 100) / 100,
          total: Math.round((exVat + vatAmount) * 100) / 100,
          currency: "SAR",
        },
        createdById: userId,
      })
      .returning();
  });

  await recordZatcaAudit({
    tenantId,
    userId,
    action: "ZATCA_INVOICE_CREATED",
    entityId: doc.id,
    newState: {
      orderId,
      invoiceNumber,
      invoiceType: type,
      counterValue: counter,
      status: "DRAFT",
    },
  });

  // Attempt live submission only when production tokens exist
  const secrets = await loadSecrets(tenantId);
  if (!secrets) {
    await db
      .update(zatcaDocuments)
      .set({
        status: "PENDING",
        fatooraResponse: { submittedXml: xml, state: "NOT_SUBMITTED" },
      })
      .where(eq(zatcaDocuments.id, doc.id));
    await recordZatcaAudit({
      tenantId,
      userId,
      action: "ZATCA_INVOICE_PENDING",
      entityId: doc.id,
      newState: { status: "PENDING", reason: "credentials_not_configured" },
    });
    return {
      ...doc,
      status: "PENDING",
      submitted: false,
      message: "Stored as PENDING — configure Fatoora tokens to clear live",
      qrTlvBase64: qr,
    };
  }

  const path =
    type === "STANDARD" ? "/invoices/clearance/single" : "/invoices/reporting/single";

  let submission: { ok: boolean; body: Record<string, unknown> };
  try {
    submission = await fatooraPost(cfg.env, path, secrets.binaryToken, secrets.secret, {
      invoiceHash: hash,
      uuid,
      invoice: Buffer.from(xml, "utf8").toString("base64"),
    });
  } catch (error) {
    // A timeout is unknown: Fatoora may have accepted the request. Keep the
    // document and replay the same UUID/hash later instead of creating a new one.
    const reason =
      error instanceof Error && error.name === "TimeoutError"
        ? "Fatoora request timed out; submission state is unknown"
        : "Fatoora request failed; submission state requires reconciliation";
    await db
      .update(zatcaDocuments)
      .set({
        status: "PENDING",
        rejectionReason: reason,
        fatooraResponse: {
          error: "SUBMISSION_UNKNOWN",
          submittedXml: xml,
          at: new Date().toISOString(),
        },
      })
      .where(eq(zatcaDocuments.id, doc.id));
    await recordZatcaAudit({
      tenantId,
      userId,
      action: "ZATCA_SUBMISSION_UNKNOWN",
      entityId: doc.id,
      newState: { status: "PENDING", reason: "gateway_timeout_or_network_error" },
    });
    return {
      ...doc,
      status: "PENDING",
      submitted: false,
      message: reason,
      qrTlvBase64: qr,
    };
  }

  const { ok, body } = submission;
  const vr = body.validationResults as
    | { status?: string; errorMessages?: { message: string }[] }
    | undefined;
  const explicitStatus =
    type === "STANDARD"
      ? (body.clearanceStatus as string) === "CLEARED"
      : (body.reportingStatus as string) === "REPORTED";
  const cleared =
    ok && (explicitStatus || (!body.clearanceStatus && !body.reportingStatus && vr?.status === "PASS"));
  const returnedQr =
    (typeof body.qrCode === "string" && body.qrCode) ||
    (typeof body.qr_code === "string" && body.qr_code) ||
    null;
  const finalStatus = cleared ? (type === "STANDARD" ? "CLEARED" : "REPORTED") : "REJECTED";
  const rejection =
    !cleared
      ? vr?.errorMessages?.map((e) => e.message).join("; ") ??
        (body.message as string) ??
        `Fatoora rejected the invoice`
      : null;

  const [final] = await db
    .update(zatcaDocuments)
    .set({
      status: finalStatus,
      qrTlvBase64: returnedQr ?? qr,
      fatooraResponse: { ...body, submittedXml: xml },
      rejectionReason: rejection,
      clearedAt: cleared ? new Date() : null,
    })
    .where(eq(zatcaDocuments.id, doc.id))
    .returning();

  await recordZatcaAudit({
    tenantId,
    userId,
    action: cleared ? "ZATCA_INVOICE_CLEARED" : "ZATCA_INVOICE_REJECTED",
    entityId: doc.id,
    newState: { status: finalStatus, hasReturnedQr: Boolean(returnedQr) },
  });

  return {
    ...final,
    submitted: true,
    message: cleared
      ? `Invoice ${finalStatus.toLowerCase()} by ZATCA`
      : `Rejected: ${rejection}`,
  };
}

export async function listDocuments(tenantId: string, limit = 100) {
  return db
    .select()
    .from(zatcaDocuments)
    .where(eq(zatcaDocuments.tenantId, tenantId))
    .orderBy(desc(zatcaDocuments.createdAt))
    .limit(Math.min(500, Math.max(1, limit)));
}

export async function complianceSummary(tenantId: string) {
  const docs = await db
    .select({ status: zatcaDocuments.status })
    .from(zatcaDocuments)
    .where(eq(zatcaDocuments.tenantId, tenantId));
  const byStatus: Record<string, number> = {};
  for (const d of docs) byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
  const cleared = (byStatus.CLEARED ?? 0) + (byStatus.REPORTED ?? 0);
  const submitted = cleared + (byStatus.REJECTED ?? 0);
  return {
    total: docs.length,
    byStatus,
    submitted,
    accepted: cleared,
    acceptanceRatePct: submitted > 0 ? Math.round((cleared / submitted) * 100) : 100,
    pending: byStatus.PENDING ?? 0,
  };
}
