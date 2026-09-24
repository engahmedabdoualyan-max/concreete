#!/usr/bin/env node
/** Report API route files that do not mention tenant scoping yet. */
import fs from 'node:fs';
import path from 'node:path';

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? files(full) : full.endsWith('route.ts') ? [full] : [];
  });
}
const routes = files('src/app/api');
const missing = routes.filter((file) => {
  const source = fs.readFileSync(file, 'utf8');
  return !source.includes('tenantId');
});
console.log(`API route files: ${routes.length}; without an explicit tenantId reference: ${missing.length}`);
for (const file of missing) console.log(`REVIEW ${file}`);
