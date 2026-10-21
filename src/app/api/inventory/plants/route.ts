/**
 * ============================================================
 *  /api/inventory/plants — Plant management (under sites)
 * ============================================================
 *  GET  — List plants (with site info)
 *  POST — Create a new plant
 *  RBAC: INVENTORY_READ (GET) · INVENTORY_RECEIVE (POST)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { plants, sites, inventorySilos } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { z } from "zod";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.INVENTORY_READ);
  if ("status" in auth) return auth;

  // Get plants with site info
  const allPlants = await db
    .select({
      plant: plants,
      site: sites,
    })
    .from(plants)
    .leftJoin(sites, eq(plants.siteId, sites.id))
    .where(and(eq(plants.tenantId, auth.user.tenantId), eq(plants.isActive, true)))
    .orderBy(plants.plantType, plants.plantName);

  // Get silo counts separately
  const siloCounts = await db
    .select({
      plantId: inventorySilos.plantId,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(inventorySilos)
    .where(eq(inventorySilos.tenantId, auth.user.tenantId))
    .groupBy(inventorySilos.plantId);

  const countMap = new Map(siloCounts.map((sc) => [sc.plantId, Number(sc.count)]));

  const allSites = await db
    .select()
    .from(sites)
    .where(and(eq(sites.tenantId, auth.user.tenantId), eq(sites.isActive, true)))
    .orderBy(sites.siteName);

  return successResponse({
    plants: allPlants.map(({ plant, site }) => ({
      ...plant,
      site: site ? { id: site.id, siteCode: site.siteCode, siteName: site.siteName } : null,
      siloCount: countMap.get(plant.id) ?? 0,
    })),
    sites: allSites,
  });
}

const CreatePlantSchema = z.object({
  siteId: z.string().uuid("Invalid site"),
  plantCode: z.string().min(2).max(20),
  plantName: z.string().min(2).max(120),
  plantType: z.enum(["CONCRETE", "BLOCK"]),
  description: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.INVENTORY_RECEIVE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = CreatePlantSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid plant data", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  // Verify site exists and belongs to tenant
  const [site] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, parsed.data.siteId), eq(sites.tenantId, auth.user.tenantId)))
    .limit(1);

  if (!site) return errorResponse("NOT_FOUND", "Site not found", 404);

  try {
    const [created] = await db
      .insert(plants)
      .values({
        tenantId: auth.user.tenantId,
        siteId: parsed.data.siteId,
        plantCode: parsed.data.plantCode,
        plantName: parsed.data.plantName,
        plantType: parsed.data.plantType,
        description: parsed.data.description ?? null,
        createdById: auth.user.sub,
      })
      .returning();

    return successResponse(created, "تم إنشاء البلانت", 201);
  } catch (err) {
    console.error("[POST /api/inventory/plants]", err);
    return errorResponse("PLANT_CREATE_ERROR", "Failed to create plant", 500);
  }
}