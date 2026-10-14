#!/usr/bin/env node
/**
 * Lightweight repository secret scan.
 * It intentionally reports high-confidence patterns only; public Firebase
 * config keys are listed as INFO because they are not server secrets.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const root = process.cwd();
const textExtensions = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".json", ".mjs", ".cjs", ".yml", ".yaml",
  ".env", ".md", ".sh", ".sql", ".toml", ".txt",
]);
const ignoredDirectories = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage"]);
const findings = [];
const info = [];

function trackedFiles() {
  const raw = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" });
  return raw.split("\0").filter(Boolean);
}

function isProbablyText(path) {
  if (ignoredDirectories.has(path.split("/")[0])) return false;
  if (path.includes("/node_modules/") || path.includes("/dist/") || path.includes("/.next/")) return false;
  return textExtensions.has(extname(path)) || path === ".env" || path.endsWith(".env.example");
}

const patterns = [
  { name: "private-key", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, severity: "CRITICAL" },
  { name: "github-token", re: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, severity: "CRITICAL" },
  { name: "aws-access-key", re: /\bAKIA[0-9A-Z]{16}\b/g, severity: "CRITICAL" },
  { name: "stripe-live-key", re: /\bsk_live_[A-Za-z0-9]{20,}\b/g, severity: "CRITICAL" },
  { name: "slack-token", re: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g, severity: "CRITICAL" },
  { name: "expo-token-assignment", re: /\bEXPO_TOKEN\s*=\s*[^\s"'`]+/g, severity: "CRITICAL" },
  // A value is only suspicious when it is a literal. `$(...)` (generated at
  // run time, e.g. openssl rand -hex 32 in deploy/vps-deploy.sh) and the usual
  // placeholders are not secrets in the repository.
  { name: "private-env-value", re: /^\s*(?:JWT_SECRET|DATABASE_URL|TREE_SYNC_KEY|INTEGRATION_CRYPTO_KEY|TELEMATICS_INGEST_KEY)\s*=\s*(?!.*(?:<|replace-|your-|change-me|project-ref|process\.env|undefined|[$][(]|[$][{]))[^\s#]+/gim, severity: "HIGH" },
];
const firebaseInfo = /\bAIza[0-9A-Za-z_-]{20,}\b/g;

for (const file of trackedFiles()) {
  if (!isProbablyText(file)) continue;
  let content;
  try {
    const full = join(root, file);
    if (statSync(full).size > 2_000_000) continue;
    content = readFileSync(full, "utf8");
  } catch {
    continue;
  }

  for (const { name, re, severity } of patterns) {
    re.lastIndex = 0;
    for (const match of content.matchAll(re)) {
      findings.push({ severity, file, line: content.slice(0, match.index).split("\n").length, name });
    }
  }
  firebaseInfo.lastIndex = 0;
  for (const match of content.matchAll(firebaseInfo)) {
    info.push({ file, line: content.slice(0, match.index).split("\n").length, name: "firebase-api-key-public-config" });
  }
}

for (const localSecretFile of ['.env.local', 'website-app/.env.local']) {
  try {
    const mode = statSync(join(root, localSecretFile)).mode & 0o777;
    if ((mode & 0o077) !== 0) {
      findings.push({ severity: 'HIGH', file: localSecretFile, line: 1, name: 'world/group-readable secret file' });
    }
  } catch {
    // Optional local file; CI does not need it.
  }
}

for (const item of findings) {
  console.error(`${item.severity} ${item.file}:${item.line} ${item.name}`);
}
for (const item of info) {
  console.log(`INFO ${item.file}:${item.line} ${item.name} (verify it is intentionally public)`);
}

if (findings.length) {
  console.error(`\nSecret scan failed: ${findings.length} high-confidence finding(s).`);
  process.exit(1);
}
console.log(`Secret scan passed: no high-confidence secret patterns (${info.length} public Firebase key notice(s)).`);
