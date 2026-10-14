/**
 * sites.service — the plant and its branches (سجل مواقع المصنع والفروع).
 *
 * ── Why this is a service and not a route handler ─────────────────────────────
 * Because three separate things need to reason about sites, and each of them can
 * get the arithmetic subtly wrong in a different way:
 *
 *   1. CRUD — the company-data screen.
 *   2. "Which site is this truck nearest?" — telemetry, repeated on every reading.
 *   3. "Has it arrived?" — geofencing against the site radius.
 *
 * Distance and bearing live here so the route and the future map screen cannot
 * disagree about where a truck is.
 *
 * ── The haversine decision ───────────────────────────────────────────────────
 * Real, not flat. The alternative is the equirectangular approximation valid
 * only near the equator; Riyadh sits at 24.7°N where it is already off by ~0.5%,
 * which on a 100 km haul is half a kilometre — enough to report "arrived at the
 * plant" while the mixer is still on the access road. The exact form costs one
 * asin/cos per row and does not care.
 *
 * ── Tenant scoping ───────────────────────────────────────────────────────────
 * Every query filters on `tenantId`. `subject_id`-style columns carry no FK to a
 * tenant, so a missing filter is a silent cross-company read rather than a
 * constraint violation.
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { sites, type SiteType } from "@/db/schema";
import { isCheckViolation, isUniqueViolation, violationName } from "@/lib/db/pg-errors";

export type SiteInput = {
  siteCode: string;
  siteName: string;
  siteType?: SiteType;
  addressLine?: string | null;
  city?: string | null;
  latitude: number;
  longitude: number;
  geofenceRadiusMetres?: number;
  isPrimary?: boolean;
  notes?: string | null;
};

export type SiteErrorKind =
  | "CODE_TAKEN"
  | "ANOTHER_PRIMARY_EXISTS"
  | "PRIMARY_REQUIRED"
  | "BAD_COORDINATES"
  | "BAD_RADIUS"
  | "NOT_FOUND";

export class SiteError extends Error {
  constructor(
    readonly kind: SiteErrorKind,
    message: string
  ) {
    super(message);
    this.name = "SiteError";
  }
}

const EARTH_RADIUS_M = 6_371_000;

/**
 * Great-circle distance in metres between two coordinates.
 *
 * `to` is optional: for a plain distance the caller's own point can be the `from`
 * side. Kept explicit rather than defaulted so a nearest-site query cannot
 * accidentally measure site→site when it meant vehicle→site.
 */
export function haversineMetres(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): number {
  const toRad = Math.PI / 180;
  const dLat = (toLat - fromLat) * toRad;
  const dLng = (toLng - fromLng) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(fromLat * toRad) * Math.cos(toLat * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial bearing in degrees, 0 = north, clockwise. For "which way is it". */
export function bearingDegrees(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): number {
  const toRad = Math.PI / 180;
  const y = Math.sin((toLng - fromLng) * toRad) * Math.cos(toLat * toRad);
  const x =
    Math.cos(fromLat * toRad) * Math.sin(toLat * toRad) -
    Math.sin(fromLat * toRad) * Math.cos(toLat * toRad) * Math.cos((toLng - fromLng) * toRad);
  return (Math.atan2(y, x) / toRad + 360) % 360;
}

/**
 * Validate coordinates before they reach the database.
 *
 * The table already has CHECK constraints, and those are the real guard — but a
 * 500 from a CHECK violation is a bad answer to "you typed 91", and doing it here
 * lets the caller get a usable field-level message.
 */
function assertUsableCoordinates(latitude: number, longitude: number, radius: number) {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new SiteError(
      "BAD_COORDINATES",
      `Latitude must be between -90 and 90 (received ${latitude}).`
    );
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new SiteError(
      "BAD_COORDINATES",
      `Longitude must be between -180 and 180 (received ${longitude}).`
    );
  }
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new SiteError("BAD_RADIUS", "Geofence radius must be greater than zero metres.");
  }
}

/**
 * List sites for a tenant, primary first.
 *
 * `includeInactive` defaults to false because a retired site still has telemetry
 * arriving against it, and silently mixing those into a distance list produces
 * "nearest branch" answers that point at a closed yard.
 */
export async function listSites(tenantId: string, includeInactive = false) {
  return db
    .select()
    .from(sites)
    .where(includeInactive ? eq(sites.tenantId, tenantId) : and(eq(sites.tenantId, tenantId), eq(sites.isActive, true)))
    .orderBy(desc(sites.isPrimary), asc(sites.siteName));
}

export async function getSite(tenantId: string, siteId: string) {
  const [row] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.tenantId, tenantId)))
    .limit(1);
  return row ?? null;
}

/** The origin every distance is measured from. Null for a company with none yet. */
export async function getPrimarySite(tenantId: string) {
  const [row] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.tenantId, tenantId), eq(sites.isPrimary, true)))
    .limit(1);
  return row ?? null;
}

export async function createSite(
  tenantId: string,
  input: SiteInput,
  createdById: string | null = null
) {
  const radius = input.geofenceRadiusMetres ?? 200;
  assertUsableCoordinates(input.latitude, input.longitude, radius);

  try {
    const [row] = await db
      .insert(sites)
      .values({
        tenantId,
        siteCode: input.siteCode.trim(),
        siteName: input.siteName.trim(),
        siteType: input.siteType ?? "BRANCH",
        addressLine: input.addressLine ?? null,
        city: input.city ?? null,
        latitude: String(input.latitude),
        longitude: String(input.longitude),
        geofenceRadiusMetres: Math.round(radius),
        isPrimary: input.isPrimary ?? false,
        notes: input.notes ?? null,
        createdById,
      })
      .returning();
    return row!;
  } catch (err) {
    // The partial unique index on is_primary fires here too, so the constraint
    // name — not the message — is what distinguishes "someone beat me to HQ" from
    // "that code is taken". Both are 409, but they need different advice.
    if (isUniqueViolation(err)) {
      if (violationName(err) === "sites_one_primary_per_tenant") {
        throw new SiteError(
          "ANOTHER_PRIMARY_EXISTS",
          "This company already has a primary site. Promote the existing one off primary first, or mark this site as a branch."
        );
      }
      throw new SiteError("CODE_TAKEN", `Site code "${input.siteCode}" is already used by this company.`);
    }
    if (isCheckViolation(err)) {
      throw new SiteError("BAD_COORDINATES", "Those coordinates are outside the valid range.");
    }
    throw err;
  }
}

export async function updateSite(
  tenantId: string,
  siteId: string,
  patch: Partial<SiteInput>
) {
  const existing = await getSite(tenantId, siteId);
  if (!existing) throw new SiteError("NOT_FOUND", "Site not found.");

  const latitude = patch.latitude ?? Number(existing.latitude);
  const longitude = patch.longitude ?? Number(existing.longitude);
  const radius = patch.geofenceRadiusMetres ?? existing.geofenceRadiusMetres;
  assertUsableCoordinates(latitude, longitude, radius);

  try {
    const [row] = await db
      .update(sites)
      .set({
        ...(patch.siteName !== undefined ? { siteName: patch.siteName.trim() } : {}),
        ...(patch.siteType !== undefined ? { siteType: patch.siteType } : {}),
        ...(patch.addressLine !== undefined ? { addressLine: patch.addressLine } : {}),
        ...(patch.city !== undefined ? { city: patch.city } : {}),
        ...(patch.latitude !== undefined ? { latitude: String(patch.latitude) } : {}),
        ...(patch.longitude !== undefined ? { longitude: String(patch.longitude) } : {}),
        ...(patch.geofenceRadiusMetres !== undefined
          ? { geofenceRadiusMetres: Math.round(patch.geofenceRadiusMetres) }
          : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(sites.id, siteId), eq(sites.tenantId, tenantId)))
      .returning();
    return row!;
  } catch (err) {
    if (isCheckViolation(err)) {
      throw new SiteError("BAD_COORDINATES", "Those coordinates are outside the valid range.");
    }
    throw err;
  }
}

/**
 * Make one site the company's origin.
 *
 * TWO statements, inside one transaction — and that exact shape is load-bearing,
 * because the obvious single-statement rewrite is a coin flip:
 *
 *     UPDATE sites SET is_primary = (id = $2) WHERE ...
 *
 * reads like it should work, and it DOES work — until Postgres happens to
 * process the incoming-primary row before the outgoing one. Unique index checks
 * are per-row and immediate, not deferred to end-of-statement, so flipping the
 * old row off after the new row goes on trips `sites_one_primary_per_tenant`.
 * Which row lands first is an implementation detail, so the failure is
 * intermittent: it passed on DMM→HQ and then failed on DMM→HQ a second time.
 *
 * Two statements in a transaction are order-independent, because the second
 * statement's index check already sees the first statement's writes.
 */
export async function promoteSite(tenantId: string, siteId: string) {
  const existing = await getSite(tenantId, siteId);
  if (!existing) throw new SiteError("NOT_FOUND", "Site not found.");
  if (!existing.isActive) {
    throw new SiteError("PRIMARY_REQUIRED", "An inactive site cannot be the primary site.");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(sites)
      .set({ isPrimary: false })
      .where(and(eq(sites.tenantId, tenantId), eq(sites.isPrimary, true), sql`${sites.id} <> ${siteId}::uuid`));

    await tx
      .update(sites)
      .set({ isPrimary: true, updatedAt: new Date() })
      .where(and(eq(sites.id, siteId), eq(sites.tenantId, tenantId)));
  });

  return getSite(tenantId, siteId);
}

/**
 * Retire a site (soft delete — telemetry keeps arriving against it).
 *
 * The database refuses to retire the only primary; the message names the fix,
 * because "cannot remove the primary site" with no next step is the kind of
 * error that gets worked around by deleting something else.
 */
export async function deactivateSite(tenantId: string, siteId: string) {
  const existing = await getSite(tenantId, siteId);
  if (!existing) throw new SiteError("NOT_FOUND", "Site not found.");

  try {
    const [row] = await db
      .update(sites)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(sites.id, siteId), eq(sites.tenantId, tenantId)))
      .returning();
    return row!;
  } catch (err) {
    if (isCheckViolation(err)) {
      throw new SiteError(
        "PRIMARY_REQUIRED",
        "This is the primary site. Promote another site to primary first, then retire this one."
      );
    }
    throw err;
  }
}

export type NearestSite = {
  siteId: string;
  siteCode: string;
  siteName: string;
  siteType: SiteType;
  distanceMetres: number;
  bearingDegrees: number;
  isInsideGeofence: boolean;
  geofenceRadiusMetres: number;
};

/**
 * A site with a measured distance from some point, ready for a client.
 *
 * The coordinates come along deliberately. A driver asking "how far am I from
 * the plant" needs to be able to draw it on a map, and re-sending lat/lng from a
 * second round trip would let the two answers drift apart (a promote, a radius
 * edit) so the number on screen no longer matches the pin.
 */
export type SiteWithDistance = NearestSite & {
  latitude: number;
  longitude: number;
  city: string | null;
  addressLine: string | null;
  isPrimary: boolean;
};

export type SitesNearPoint = {
  latitude: number;
  longitude: number;
  /** Nearest first. Empty when the company has no active sites yet. */
  sites: SiteWithDistance[];
  hasPrimarySite: boolean;
};

/**
 * Every active site of the tenant, measured from a point and sorted nearest-first.
 *
 * ── Why this is separate from /api/fleet/positions ─────────────────────────────
 * A driver standing in the yard needs to know which branch he is near and how far
 * the plant is. He does not get the position of every other truck in the fleet —
 * `/fleet/positions` is gated on FLEET_POSITION_READ, which DRIVER does not hold
 * — so this returns site geometry and nothing else, which is what lets the driver
 * app ask the question without needing that grant.
 *
 * Returning all sites rather than just the winner is what lets the same response
 * answer both questions a driver actually has ("which one am I at" = sites[0],
 * "how far is the plant" = the isPrimary row) without a second request, and the
 * client picks by flag rather than by array position — a company whose nearest
 * site is a branch must not have "the plant" silently mean "row 0".
 */
export async function sitesWithDistancesFrom(
  tenantId: string,
  latitude: number,
  longitude: number
): Promise<SitesNearPoint> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { latitude, longitude, sites: [], hasPrimarySite: false };
  }

  const candidates = await listSites(tenantId, false);
  const measured: SiteWithDistance[] = candidates.map((s) => {
    const lat = Number(s.latitude);
    const lng = Number(s.longitude);
    const distanceMetres = haversineMetres(latitude, longitude, lat, lng);
    return {
      siteId: s.id,
      siteCode: s.siteCode,
      siteName: s.siteName,
      siteType: s.siteType,
      latitude: lat,
      longitude: lng,
      city: s.city,
      addressLine: s.addressLine,
      isPrimary: s.isPrimary,
      distanceMetres: Math.round(distanceMetres),
      bearingDegrees: Math.round(bearingDegrees(latitude, longitude, lat, lng)),
      isInsideGeofence: distanceMetres <= s.geofenceRadiusMetres,
      geofenceRadiusMetres: s.geofenceRadiusMetres,
    };
  });

  measured.sort((a, b) => a.distanceMetres - b.distanceMetres);

  return {
    latitude,
    longitude,
    sites: measured,
    hasPrimarySite: measured.some((s) => s.isPrimary),
  };
}

/**
 * Nearest site to a point, with distance, bearing and arrival.
 *
 * Computed in memory over the tenant's active sites rather than in SQL: a
 * company has a handful of sites, so a `ST_DWithin` round trip would add a
 * PostGIS dependency to answer a question about five rows. The `(tenant_id,
 * latitude, longitude)` index keeps the read itself indexed for the tenant.
 *
 * `isInsideGeofence` uses each site's OWN radius, not a single global one — a
 * branch gate and a 200 m plant geofence are not the same size.
 */
export async function nearestSiteTo(
  tenantId: string,
  latitude: number,
  longitude: number
): Promise<NearestSite | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const candidates = await listSites(tenantId, false);
  if (candidates.length === 0) return null;

  let best: NearestSite | null = null;
  for (const s of candidates) {
    const lat = Number(s.latitude);
    const lng = Number(s.longitude);
    const distanceMetres = haversineMetres(latitude, longitude, lat, lng);
    if (best && distanceMetres >= best.distanceMetres) continue;
    best = {
      siteId: s.id,
      siteCode: s.siteCode,
      siteName: s.siteName,
      siteType: s.siteType,
      distanceMetres: Math.round(distanceMetres),
      bearingDegrees: Math.round(bearingDegrees(latitude, longitude, lat, lng)),
      isInsideGeofence: distanceMetres <= s.geofenceRadiusMetres,
      geofenceRadiusMetres: s.geofenceRadiusMetres,
    };
  }
  return best;
}