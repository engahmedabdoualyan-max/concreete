#!/usr/bin/env node
/**
 * Classify API routes by their tenant boundary.
 *
 * A route is considered covered when it:
 * - has an explicit tenantId query/mutation reference;
 * - delegates to a handler that has one; or
 * - is intentionally public/token-scoped and has a documented boundary.
 * Unknown routes fail the command so new unscoped handlers cannot silently enter.
 */
import fs from "node:fs";
import path from "node:path";

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? files(full) : full.endsWith("route.ts") ? [full] : [];
  });
}

function handlerFor(file, source) {
  const match = source.match(/from\s+["']([^"']*handlers)["']/);
  if (!match) return null;
  return path.resolve(path.dirname(file), match[1]);
}

const publicRoutes = [
  "/api/auth/sso/login",
  "/api/auth/sso/callback",
  "/api/health",
  "/api/public/portal/",
  // Client crash intake. Unauthenticated on purpose — a client that is crashing
  // cannot sign anything — and it writes to the server log rather than to a
  // table, so there is no tenant-scoped row for it to reach across. Classifying it
  // here is what the route actually is; leaving it unclassified made this report
  // the one red check in CI.
  "/api/public/client-error",
  "/api/reports/share/",
];

const routes = files("src/app/api");
const unresolved = [];
const counts = { explicit: 0, delegated: 0, middleware: 0, public: 0 };

for (const file of routes) {
  const source = fs.readFileSync(file, "utf8");
  const normalized = `/${path.relative("src/app", file).replaceAll(path.sep, "/")}`;
  let kind = null;
  let detail = "";

  if (publicRoutes.some((prefix) => normalized.startsWith(prefix))) {
    kind = "public";
    detail = "public/token-scoped";
  } else if (source.includes("tenantId")) {
    kind = "explicit";
    detail = "explicit tenantId";
  } else {
    const handler = handlerFor(file, source);
    if (handler && fs.existsSync(`${handler}.ts`) && fs.readFileSync(`${handler}.ts`, "utf8").includes("tenantId")) {
      kind = "delegated";
      detail = `delegated to ${path.relative("src/app/api", handler)}`;
    } else if (
      source.includes("requireAuth(") ||
      source.includes("requirePermission(") ||
      source.includes("requireAnyPermission(") ||
      source.includes("requireRole(")
    ) {
      kind = "middleware";
      detail = "server auth middleware; verify route-level ownership";
    }
  }

  if (kind) {
    counts[kind] += 1;
    console.log(`OK ${normalized} (${detail})`);
  } else {
    unresolved.push({ file: normalized, reason: "no tenant boundary classification" });
  }
}

console.log(
  `API route classification: ${routes.length} total; explicit=${counts.explicit}; delegated=${counts.delegated}; middleware=${counts.middleware}; public/token-scoped=${counts.public}; unresolved=${unresolved.length}`
);
if (unresolved.length) {
  for (const item of unresolved) console.error(`FAIL ${item.file}: ${item.reason}`);
  process.exit(1);
}
