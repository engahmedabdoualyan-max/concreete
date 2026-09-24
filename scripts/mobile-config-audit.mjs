#!/usr/bin/env node
/** Static mobile release/OTA configuration audit; no credentials or network required. */
import { readFileSync } from "node:fs";

const app = JSON.parse(readFileSync("website-app/apps/mobile/app.json", "utf8"));
const eas = JSON.parse(readFileSync("website-app/apps/mobile/eas.json", "utf8"));
const expo = app.expo ?? {};
const android = expo.android ?? {};
const updates = expo.updates ?? {};
const easBuild = eas.build ?? {};
const failures = [];
const checks = [];

function check(condition, message) {
  checks.push(message);
  if (!condition) failures.push(message);
}

check(typeof expo.version === "string" && /^\d+\.\d+\.\d+$/.test(expo.version), "app version is semver");
check(Number.isInteger(android.versionCode) && android.versionCode > 0, "Android versionCode is a positive integer");
check(expo.runtimeVersion?.policy === "appVersion", "OTA runtimeVersion uses appVersion policy");
check(updates.enabled === true, "Expo updates are enabled");
check(typeof updates.url === "string" && updates.url.startsWith("https://u.expo.dev/"), "Expo updates URL is explicit HTTPS");
check(typeof expo.extra?.eas?.projectId === "string", "EAS projectId is configured");
check(easBuild.preview?.distribution === "internal" && easBuild.preview?.android?.buildType === "apk", "preview profile is an internal APK");
check(easBuild.production?.channel === "production", "production profile has a production channel");
check(android.allowBackup === false, "Android backups are disabled");
check(Array.isArray(android.blockedPermissions) && android.blockedPermissions.includes("android.permission.SYSTEM_ALERT_WINDOW"), "overlay permission is blocked");
check(Array.isArray(android.permissions) && new Set(android.permissions).size === android.permissions.length, "Android permission list has no duplicates");
const buildProperties = (expo.plugins ?? []).find(
  (plugin) => Array.isArray(plugin) && plugin[0] === "expo-build-properties"
);
check(buildProperties?.[1]?.android?.usesCleartextTraffic === false, "Android cleartext traffic is disabled");

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}
console.log(`Mobile config audit passed (${checks.length} checks).`);
