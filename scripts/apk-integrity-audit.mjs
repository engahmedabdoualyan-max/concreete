#!/usr/bin/env node
/** Verify the checked-in APK artifact without changing or rebuilding it. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const apk = "website-app/public/downloads/fimto-android.apk";
const checksum = `${apk}.sha256`;
if (!existsSync(apk)) {
  console.log("APK integrity audit skipped: no checked-in/local APK artifact.");
  process.exit(0);
}
if (!existsSync(checksum)) {
  console.error("APK exists but its SHA-256 sidecar is missing");
  process.exit(1);
}
const expected = readFileSync(checksum, "utf8").trim().split(/\s+/)[0];
const actual = createHash("sha256").update(readFileSync(apk)).digest("hex");
if (expected !== actual) {
  console.error(`APK SHA-256 mismatch: expected ${expected}, got ${actual}`);
  process.exit(1);
}
const zip = spawnSync("unzip", ["-tq", apk], { stdio: "ignore" });
if (zip.status !== 0) {
  console.error("APK ZIP integrity check failed");
  process.exit(1);
}
console.log(`APK integrity passed (${actual}).`);
console.log("Manifest/signing inspection still requires aapt/apksigner or EAS build metadata.");
