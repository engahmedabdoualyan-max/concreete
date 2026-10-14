/**
 * Exercises the geo helpers in sites.service against the live register.
 * Run: npx tsx scripts/.verify-site-geo.ts
 */
import {
  getPrimarySite,
  nearestSiteTo,
  haversineMetres,
  bearingDegrees,
  listSites,
} from "../src/lib/services/sites.service";

const TENANT = "32f99b3d-eb5b-4673-9382-78d1f0e1ffbe"; // ALMOTWER

async function main() {
  const all = await listSites(TENANT, false);
  console.log(`active sites: ${all.length}`);
  for (const s of all) {
    console.log(`  ${s.siteCode.padEnd(8)} ${String(s.siteName).padEnd(24)} ${s.latitude},${s.longitude} r=${s.geofenceRadiusMetres}m`);
  }

  const primary = await getPrimarySite(TENANT);
  console.log(`\nprimary site: ${primary ? `${primary.siteCode} (${primary.siteName})` : "NONE"}`);
  if (!primary) throw new Error("expected a primary site");

  // A truck sitting exactly on the plant gate.
  const onGate = await nearestSiteTo(TENANT, Number(primary.latitude), Number(primary.longitude));
  console.log(`\nat the plant gate -> ${onGate!.siteCode} ${onGate!.distanceMetres}m, bearing ${onGate!.bearingDegrees}°, inside=${onGate!.isInsideGeofence}`);
  if (onGate!.distanceMetres !== 0) throw new Error("expected 0 m at the primary site");
  if (!onGate!.isInsideGeofence) throw new Error("expected inside its own geofence");

  // Halfway Riyadh -> Jeddah should be nearer Jeddah than the plant.
  const midway = await nearestSiteTo(TENANT, 23.1, 42.9);
  console.log(`midway Riyadh->Jeddah -> ${midway!.siteCode} ${(midway!.distanceMetres / 1000).toFixed(1)} km, inside=${midway!.isInsideGeofence}`);
  if (midway!.siteCode !== "BR-JED") throw new Error(`expected BR-JED, got ${midway!.siteCode}`);
  if (midway!.isInsideGeofence) throw new Error("midway point must NOT be inside any geofence");

  // Just OUTSIDE the Jeddah fence: proves the radius is actually applied.
  const site = all.find((s) => s.siteCode === "BR-JED")!;
  const lat = Number(site.latitude), lng = Number(site.longitude);
  const justOutside = await nearestSiteTo(TENANT, lat + site.geofenceRadiusMetres / 111_320 * 1.5, lng);
  const justInside = await nearestSiteTo(TENANT, lat + site.geofenceRadiusMetres / 111_320 * 0.5, lng);
  console.log(`\nJeddah fence r=${site.geofenceRadiusMetres}m:`);
  console.log(`  ${justInside!.distanceMetres}m -> inside=${justInside!.isInsideGeofence} (expect true)`);
  console.log(`  ${justOutside!.distanceMetres}m -> inside=${justOutside!.isInsideGeofence} (expect false)`);
  if (!justInside!.isInsideGeofence) throw new Error("point at half the radius must be inside");
  if (justOutside!.isInsideGeofence) throw new Error("point at 1.5x the radius must be outside");

  // Bearing sanity. On a sphere the reverse bearing is NOT (forward + 180): it is
  // off by the convergence angle, which for this leg is ~1.5°. Asserting the two
  // sum to 360 (or differ by exactly 180) would be asserting a rhumb-line
  // property and would fail against a correct implementation.
  const b = bearingDegrees(24.7136, 46.6753, 26.4207, 50.0888);
  const back = bearingDegrees(26.4207, 50.0888, 24.7136, 46.6753);
  const convergence = Math.abs(((back - b - 180 + 540) % 360) - 180);
  console.log(`\nbearing Riyadh->Dammam ${b.toFixed(1)}°, back ${back.toFixed(1)}°, convergence ${convergence.toFixed(2)}°`);
  if (convergence > 5) throw new Error(`convergence ${convergence}° is too large for this leg`);
  for (const v of [b, back]) {
    if (v < 0 || v >= 360) throw new Error(`bearing ${v} out of range`);
  }
  // Cardinal checks. Due-east is NOT exactly 90° at a non-zero latitude: a great
  // circle between two points on the same parallel bows toward the pole, so the
  // initial heading is a little north of east (89.6° at 24°N over 2° of
  // longitude). Asserting equality to 90° would fail a correct implementation;
  // 0.5° is comfortably inside the real value and still catches sign errors.
  const east = bearingDegrees(24, 46, 24, 48);
  const north = bearingDegrees(24, 46, 26, 46);
  const west = bearingDegrees(24, 46, 24, 44);
  const south = bearingDegrees(24, 46, 22, 46);
  console.log(`cardinals: east ${east.toFixed(2)}°, north ${north.toFixed(2)}°, west ${west.toFixed(2)}°, south ${south.toFixed(2)}°`);
  if (Math.abs(east - 90) > 0.5) throw new Error("due east is not ~90°");
  if (Math.abs(north) > 0.5) throw new Error("due north is not ~0°");
  if (Math.abs(west - 270) > 0.5) throw new Error("due west is not ~270°");
  if (Math.abs(south - 180) > 0.5) throw new Error("due south is not ~180°");

  if (haversineMetres(24.7136, 46.6753, 24.7136, 46.6753) !== 0) throw new Error("zero distance");

  console.log("\nAll site-geo checks passed.");
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});