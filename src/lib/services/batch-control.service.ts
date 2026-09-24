/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Batch Control Service (Epic 10 — Competitive Parity)
 * ============================================================
 *
 *  Registry + live reads for batch-plant controllers.
 *  SECURITY: settings.apiKey (gateway tokens) is NEVER returned
 *  to API clients — reads go through sanitizedSettings().
 * ============================================================
 */

import { db } from "@/db";
import { batchControllers, batchPlants } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type {
  BatchController,
  BatchControllerProvider,
} from "../integrations/batch/controller";
import { modbusController } from "../integrations/batch/modbus.controller";
import { httpGatewayController } from "../integrations/batch/http-gateway.controller";
import { simulatorController } from "../integrations/batch/simulator.controller";

const CONTROLLERS: Record<BatchControllerProvider, BatchController> = {
  MODBUS_TCP: modbusController,
  HTTP_GATEWAY: httpGatewayController,
  SIMULATOR: simulatorController,
};

export function controllerFor(provider: string): BatchController | null {
  if (
    provider === "MODBUS_TCP" ||
    provider === "HTTP_GATEWAY" ||
    provider === "SIMULATOR"
  ) {
    return CONTROLLERS[provider];
  }
  return null;
}

/** Strips secrets before anything leaves the service layer. */
export function sanitizedSettings(settings: unknown): Record<string, unknown> {
  const s = ((settings ?? {}) as Record<string, unknown>) ?? {};
  const { apiKey: _drop, ...rest } = s;
  void _drop;
  return rest;
}

export async function listControllers(tenantId: string) {
  const rows = await db
    .select({
      id: batchControllers.id,
      batchPlantId: batchControllers.batchPlantId,
      plantName: batchPlants.plantName,
      name: batchControllers.name,
      provider: batchControllers.provider,
      settings: batchControllers.settings,
      isActive: batchControllers.isActive,
      lastStatus: batchControllers.lastStatus,
      lastSeenAt: batchControllers.lastSeenAt,
      createdAt: batchControllers.createdAt,
    })
    .from(batchControllers)
    .leftJoin(
      batchPlants,
      and(eq(batchControllers.batchPlantId, batchPlants.id), eq(batchPlants.tenantId, tenantId))
    )
    .where(eq(batchControllers.tenantId, tenantId))
    .orderBy(batchControllers.createdAt);

  return rows.map((r) => ({ ...r, settings: sanitizedSettings(r.settings) }));
}

export async function createController(
  tenantId: string,
  userId: string,
  input: {
    batchPlantId?: string;
    name: string;
    provider: BatchControllerProvider;
    settings?: Record<string, unknown>;
  }
) {
  if (!controllerFor(input.provider)) throw new Error("Unknown provider");
  if (input.batchPlantId) {
    const p = await db
      .select({ id: batchPlants.id })
      .from(batchPlants)
      .where(and(eq(batchPlants.id, input.batchPlantId), eq(batchPlants.tenantId, tenantId)))
      .limit(1);
    if (!p[0]) throw new Error("Batch plant not found");
  }
  const [created] = await db
    .insert(batchControllers)
    .values({
      tenantId,
      batchPlantId: input.batchPlantId || null,
      name: input.name,
      provider: input.provider,
      settings: input.settings ?? {},
      createdById: userId,
    })
    .returning();
  return { ...created, settings: sanitizedSettings(created.settings) };
}

export async function updateController(
  tenantId: string,
  controllerId: string,
  input: {
    name?: string;
    settings?: Record<string, unknown>;
    isActive?: boolean;
    batchPlantId?: string;
  }
) {
  // Merge settings (so apiKey survives partial updates when omitted)
  const current = await db
    .select({ settings: batchControllers.settings })
    .from(batchControllers)
    .where(
      and(
        eq(batchControllers.id, controllerId),
        eq(batchControllers.tenantId, tenantId)
      )
    )
    .limit(1);
  if (!current[0]) return null;

  if (input.batchPlantId) {
    const plant = await db
      .select({ id: batchPlants.id })
      .from(batchPlants)
      .where(and(eq(batchPlants.id, input.batchPlantId), eq(batchPlants.tenantId, tenantId)))
      .limit(1);
    if (!plant[0]) return null;
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.isActive !== undefined) patch.isActive = input.isActive;
  if (input.batchPlantId !== undefined) patch.batchPlantId = input.batchPlantId || null;
  if (input.settings !== undefined) {
    patch.settings = {
      ...((current[0].settings ?? {}) as Record<string, unknown>),
      ...input.settings,
    };
  }

  const [updated] = await db
    .update(batchControllers)
    .set(patch)
    .where(
      and(eq(batchControllers.id, controllerId), eq(batchControllers.tenantId, tenantId))
    )
    .returning();
  return { ...updated, settings: sanitizedSettings(updated.settings) };
}

export async function deleteController(tenantId: string, controllerId: string) {
  const deleted = await db
    .delete(batchControllers)
    .where(
      and(
        eq(batchControllers.id, controllerId),
        eq(batchControllers.tenantId, tenantId)
      )
    )
    .returning({ id: batchControllers.id });
  return deleted.length > 0;
}

async function loadFull(tenantId: string, controllerId: string) {
  const rows = await db
    .select()
    .from(batchControllers)
    .where(
      and(
        eq(batchControllers.id, controllerId),
        eq(batchControllers.tenantId, tenantId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function testController(tenantId: string, controllerId: string) {
  const row = await loadFull(tenantId, controllerId);
  if (!row) return null;
  const controller = controllerFor(row.provider);
  if (!controller) throw new Error("Unknown provider");
  const res = await controller.testConnection(
    (row.settings ?? {}) as Record<string, unknown>
  );
  await db
    .update(batchControllers)
    .set({
      lastStatus: { probe: "test", ok: res.ok, message: res.message },
      lastSeenAt: res.ok ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where(
      and(eq(batchControllers.id, controllerId), eq(batchControllers.tenantId, tenantId))
    );
  return res;
}

export async function readControllerStatus(tenantId: string, controllerId: string) {
  const row = await loadFull(tenantId, controllerId);
  if (!row) return null;
  const controller = controllerFor(row.provider);
  if (!controller) throw new Error("Unknown provider");
  const status = await controller.readStatus(
    (row.settings ?? {}) as Record<string, unknown>
  );
  await db
    .update(batchControllers)
    .set({
      lastStatus: { ...status },
      lastSeenAt: status.online ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where(
      and(eq(batchControllers.id, controllerId), eq(batchControllers.tenantId, tenantId))
    );
  return status;
}

export async function readControllerTicket(
  tenantId: string,
  controllerId: string,
  ticketNumber?: string
) {
  const row = await loadFull(tenantId, controllerId);
  if (!row) return null;
  const controller = controllerFor(row.provider);
  if (!controller) throw new Error("Unknown provider");
  return controller.readTicket(
    (row.settings ?? {}) as Record<string, unknown>,
    ticketNumber
  );
}
