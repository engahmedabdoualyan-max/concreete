/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Accounting Sync Service (Epic 6 — Competitive Parity)
 * ============================================================
 *
 *  Orchestrates external pushes (Zoho / QuickBooks / CSV bridge):
 *   • connections store ENCRYPTED credentials — plaintext never
 *     leaves this service (list/selects exclude the blob)
 *   • pushInvoice auto-pushes the customer first when no prior
 *     CUSTOMER mapping exists (one-click "Ticket → Invoice")
 *   • every attempt is written to integration_sync_logs (audit-grade)
 * ============================================================
 */

import { db } from "@/db";
import {
  integrationConnections,
  integrationSyncLogs,
  clients,
  orders,
  deliverySites,
  mixDesigns,
  zatcaDocuments,
} from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  decryptSecrets,
  encryptSecrets,
  type AccountingProvider,
} from "../integrations/accounting/connector";
import { zohoConnector } from "../integrations/accounting/zoho.connector";
import { quickbooksConnector } from "../integrations/accounting/quickbooks.connector";
import {
  csvBridgeConnector,
  exportCustomersCsv,
  exportInvoicesCsv,
} from "../integrations/accounting/csv-bridge.connector";
import type { AccountingConnector } from "../integrations/accounting/connector";

const CONNECTORS: Record<AccountingProvider, AccountingConnector> = {
  ZOHO_BOOKS: zohoConnector,
  QUICKBOOKS: quickbooksConnector,
  CSV_BRIDGE: csvBridgeConnector,
};

export function connectorFor(provider: string): AccountingConnector | null {
  if (provider === "ZOHO_BOOKS" || provider === "QUICKBOOKS" || provider === "CSV_BRIDGE") {
    return CONNECTORS[provider];
  }
  return null;
}

// ─── Connections (credentials never leave this module) ────────────────────────

const PUBLIC_FIELDS = {
  id: integrationConnections.id,
  provider: integrationConnections.provider,
  name: integrationConnections.name,
  settings: integrationConnections.settings,
  isActive: integrationConnections.isActive,
  lastTestedAt: integrationConnections.lastTestedAt,
  lastTestOk: integrationConnections.lastTestOk,
  lastTestMessage: integrationConnections.lastTestMessage,
  createdAt: integrationConnections.createdAt,
  updatedAt: integrationConnections.updatedAt,
};

export async function listConnections(tenantId: string) {
  return db
    .select(PUBLIC_FIELDS)
    .from(integrationConnections)
    .where(eq(integrationConnections.tenantId, tenantId))
    .orderBy(integrationConnections.createdAt);
}

export async function createConnection(
  tenantId: string,
  userId: string,
  input: {
    provider: AccountingProvider;
    name: string;
    credentials: Record<string, string>;
    settings?: Record<string, unknown>;
  }
) {
  if (!connectorFor(input.provider)) throw new Error("Unknown provider");
  const [created] = await db
    .insert(integrationConnections)
    .values({
      tenantId,
      provider: input.provider,
      name: input.name,
      credentialsEnc: encryptSecrets(input.credentials),
      settings: input.settings ?? {},
      createdById: userId,
    })
    .returning(PUBLIC_FIELDS);
  return created;
}

export async function updateConnection(
  tenantId: string,
  connectionId: string,
  input: {
    name?: string;
    credentials?: Record<string, string>;
    settings?: Record<string, unknown>;
    isActive?: boolean;
  }
) {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.credentials !== undefined)
    patch.credentialsEnc = encryptSecrets(input.credentials);
  if (input.settings !== undefined) patch.settings = input.settings;
  if (input.isActive !== undefined) patch.isActive = input.isActive;

  const [updated] = await db
    .update(integrationConnections)
    .set(patch)
    .where(
      and(
        eq(integrationConnections.id, connectionId),
        eq(integrationConnections.tenantId, tenantId)
      )
    )
    .returning(PUBLIC_FIELDS);
  return updated ?? null;
}

export async function deleteConnection(tenantId: string, connectionId: string) {
  const deleted = await db
    .delete(integrationConnections)
    .where(
      and(
        eq(integrationConnections.id, connectionId),
        eq(integrationConnections.tenantId, tenantId)
      )
    )
    .returning({ id: integrationConnections.id });
  return deleted.length > 0;
}

async function loadConnection(tenantId: string, connectionId: string) {
  const rows = await db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.id, connectionId),
        eq(integrationConnections.tenantId, tenantId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

async function writeLog(
  tenantId: string,
  connectionId: string,
  entry: {
    entityType: string;
    localId?: string;
    externalId?: string;
    status: "OK" | "FAILED";
    message?: string;
    payload?: Record<string, unknown>;
  }
) {
  const [row] = await db
    .insert(integrationSyncLogs)
    .values({
      tenantId,
      connectionId,
      direction: "OUT",
      entityType: entry.entityType,
      localId: entry.localId,
      externalId: entry.externalId,
      status: entry.status,
      message: entry.message,
      payload: entry.payload,
    })
    .returning();
  return row;
}

export async function getConnectionLogs(tenantId: string, connectionId: string) {
  const conn = await loadConnection(tenantId, connectionId);
  if (!conn) return null;
  return db
    .select()
    .from(integrationSyncLogs)
    .where(
      and(
        eq(integrationSyncLogs.connectionId, connectionId),
        eq(integrationSyncLogs.tenantId, tenantId)
      )
    )
    .orderBy(desc(integrationSyncLogs.createdAt))
    .limit(100);
}

async function requireAcceptedZatcaDocument(tenantId: string, orderId: string) {
  const rows = await db
    .select({ id: zatcaDocuments.id, status: zatcaDocuments.status })
    .from(zatcaDocuments)
    .where(
      and(
        eq(zatcaDocuments.tenantId, tenantId),
        eq(zatcaDocuments.orderId, orderId),
        inArray(zatcaDocuments.status, ["CLEARED", "REPORTED"])
      )
    )
    .orderBy(desc(zatcaDocuments.createdAt))
    .limit(1);
  if (rows.length === 0) {
    throw new Error("ZATCA_ACCEPTANCE_REQUIRED: invoice must be CLEARED or REPORTED before accounting export");
  }
  return rows[0];
}

async function acceptedZatcaOrderIds(tenantId: string): Promise<string[]> {
  const rows = await db
    .select({ orderId: zatcaDocuments.orderId })
    .from(zatcaDocuments)
    .where(
      and(
        eq(zatcaDocuments.tenantId, tenantId),
        inArray(zatcaDocuments.status, ["CLEARED", "REPORTED"])
      )
    );
  return [...new Set(rows.map((row) => row.orderId).filter((id): id is string => Boolean(id)))];
}

// ─── Test ─────────────────────────────────────────────────────────────────────

export async function testConnection(tenantId: string, connectionId: string) {
  const conn = await loadConnection(tenantId, connectionId);
  if (!conn) return null;
  const connector = connectorFor(conn.provider);
  if (!connector) throw new Error("Unknown provider");

  let ok = false;
  let message = "Unknown error";
  try {
    const creds = decryptSecrets(conn.credentialsEnc);
    const res = await connector.testConnection(
      creds,
      (conn.settings ?? {}) as Record<string, unknown>
    );
    ok = res.ok;
    message = res.message;
  } catch (err) {
    message = err instanceof Error ? err.message : "Test failed";
  }

  await db
    .update(integrationConnections)
    .set({
      lastTestedAt: new Date(),
      lastTestOk: ok,
      lastTestMessage: message.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(eq(integrationConnections.id, connectionId));

  await writeLog(tenantId, connectionId, {
    entityType: "CONNECTION_TEST",
    status: ok ? "OK" : "FAILED",
    message,
  });

  return { ok, message };
}

// ─── Push customer ────────────────────────────────────────────────────────────

export async function pushCustomer(
  tenantId: string,
  connectionId: string,
  clientId: string
) {
  const conn = await loadConnection(tenantId, connectionId);
  if (!conn) return null;
  const connector = connectorFor(conn.provider);
  if (!connector) throw new Error("Unknown provider");

  const c = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId)))
    .limit(1);
  const client = c[0];
  if (!client) throw new Error("Client not found");

  let result;
  try {
    const creds = decryptSecrets(conn.credentialsEnc);
    result = await connector.pushCustomer(
      creds,
      (conn.settings ?? {}) as Record<string, unknown>,
      {
        companyName: client.companyName,
        contactPerson: client.contactPerson ?? undefined,
        phone: client.phone ?? undefined,
        email: client.email ?? undefined,
        vatNumber: client.vatNumber ?? undefined,
      }
    );
  } catch (err) {
    result = {
      ok: false,
      message: err instanceof Error ? err.message : "Push failed",
    };
  }

  await writeLog(tenantId, connectionId, {
    entityType: "CUSTOMER",
    localId: clientId,
    externalId: result.externalId,
    status: result.ok ? "OK" : "FAILED",
    message: result.message,
  });

  return result;
}

async function findCustomerExternalId(
  tenantId: string,
  connectionId: string,
  clientId: string
): Promise<string | null> {
  const rows = await db
    .select({ externalId: integrationSyncLogs.externalId })
    .from(integrationSyncLogs)
    .where(
      and(
        eq(integrationSyncLogs.connectionId, connectionId),
        eq(integrationSyncLogs.tenantId, tenantId),
        eq(integrationSyncLogs.entityType, "CUSTOMER"),
        eq(integrationSyncLogs.localId, clientId),
        eq(integrationSyncLogs.status, "OK")
      )
    )
    .orderBy(desc(integrationSyncLogs.createdAt))
    .limit(1);
  return rows[0]?.externalId ?? null;
}

// ─── Push invoice (Ticket → Invoice, QuickLink-style) ─────────────────────────

export async function pushInvoice(
  tenantId: string,
  connectionId: string,
  orderId: string
) {
  const conn = await loadConnection(tenantId, connectionId);
  if (!conn) return null;
  const connector = connectorFor(conn.provider);
  if (!connector) throw new Error("Unknown provider");

  const o = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      clientId: orders.clientId,
      totalVolumeM3: orders.totalVolumeM3,
      remainingVolumeM3: orders.remainingVolumeM3,
      pricePerM3Cents: orders.pricePerM3Sar,
      companyName: clients.companyName,
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
  await requireAcceptedZatcaDocument(tenantId, orderId);

  const totalM3 = Number(order.totalVolumeM3 ?? 0);
  const deliveredM3 = Math.max(0, totalM3 - Number(order.remainingVolumeM3 ?? 0));
  const rateSar = (order.pricePerM3Cents ?? 0) / 100;
  const settings = (conn.settings ?? {}) as Record<string, unknown>;
  const currency =
    typeof settings.currency === "string" && settings.currency ? settings.currency : "SAR";

  // One-click flow: ensure the customer exists remotely first
  let customerExternalId = await findCustomerExternalId(
    tenantId,
    connectionId,
    order.clientId
  );
  if (!customerExternalId) {
    const cust = await pushCustomer(tenantId, connectionId, order.clientId);
    if (!cust || !cust.ok || !cust.externalId) {
      return {
        ok: false,
        message: `Customer push failed first: ${cust?.message ?? "connection not found"}`,
      };
    }
    customerExternalId = cust.externalId;
  }

  let result;
  try {
    const creds = decryptSecrets(conn.credentialsEnc);
    result = await connector.pushInvoice(creds, settings, {
      orderNumber: order.orderNumber,
      customerExternalId,
      customerName: order.companyName,
      lines: [
        {
          description: `${order.designCode} — ${order.siteName} (${deliveredM3} m³ delivered)`,
          quantityM3: deliveredM3,
          rateSar,
        },
      ],
      currency,
      issueDate: new Date().toISOString().slice(0, 10),
      notes: `Fimto ERP ${order.orderNumber}`,
    });
  } catch (err) {
    result = {
      ok: false,
      message: err instanceof Error ? err.message : "Push failed",
    };
  }

  await writeLog(tenantId, connectionId, {
    entityType: "INVOICE",
    localId: orderId,
    externalId: result.externalId,
    status: result.ok ? "OK" : "FAILED",
    message: result.message,
  });

  return result;
}

// ─── CSV bulk export (SAP/Oracle bridge) ──────────────────────────────────────

export async function exportCsv(
  tenantId: string,
  connectionId: string,
  type: "customers" | "invoices"
) {
  const conn = await loadConnection(tenantId, connectionId);
  if (!conn) return null;
  if (conn.provider !== "CSV_BRIDGE") {
    throw new Error("Bulk CSV export is only available on CSV_BRIDGE connections");
  }

  let content: string;
  let filename: string;
  if (type === "customers") {
    const rows = await db
      .select()
      .from(clients)
      .where(and(eq(clients.tenantId, tenantId), eq(clients.isActive, true)));
    content = exportCustomersCsv(
      rows.map((c) => ({
        clientCode: c.clientCode,
        companyName: c.companyName,
        contactPerson: c.contactPerson ?? undefined,
        phone: c.phone ?? undefined,
        email: c.email ?? undefined,
        vatNumber: c.vatNumber ?? undefined,
      }))
    );
    filename = `fimto-customers-${new Date().toISOString().slice(0, 10)}.csv`;
  } else {
    const acceptedOrderIds = await acceptedZatcaOrderIds(tenantId);
    const rows = acceptedOrderIds.length
      ? await db
          .select({
            orderNumber: orders.orderNumber,
            companyName: clients.companyName,
            siteName: deliverySites.siteName,
            designCode: mixDesigns.designCode,
            totalVolumeM3: orders.totalVolumeM3,
            remainingVolumeM3: orders.remainingVolumeM3,
            pricePerM3Cents: orders.pricePerM3Sar,
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
          .where(and(eq(orders.tenantId, tenantId), inArray(orders.id, acceptedOrderIds)))
      : [];
    content = exportInvoicesCsv(
      rows.map((o) => {
        const totalM3 = Number(o.totalVolumeM3 ?? 0);
        const deliveredM3 = Math.max(0, totalM3 - Number(o.remainingVolumeM3 ?? 0));
        const rate = (o.pricePerM3Cents ?? 0) / 100;
        return {
          orderNumber: o.orderNumber,
          customerName: o.companyName,
          siteName: o.siteName,
          mix: o.designCode,
          deliveredM3,
          pricePerM3Sar: rate,
          totalSar: Math.round(deliveredM3 * rate * 100) / 100,
          issueDate: new Date().toISOString().slice(0, 10),
          currency: "SAR",
        };
      })
    );
    filename = `fimto-invoices-${new Date().toISOString().slice(0, 10)}.csv`;
  }

  await writeLog(tenantId, connectionId, {
    entityType: "CSV_EXPORT",
    status: "OK",
    message: `${filename} (${content.length} bytes)`,
  });

  return { filename, content };
}
