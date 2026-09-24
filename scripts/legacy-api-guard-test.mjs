#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
process.env.NODE_ENV = 'production';
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? files(full) : full.endsWith('.js') ? [full] : [];
  });
}
const handlers = files('api').filter((file) => !file.endsWith('/_lib.js'));
for (const file of handlers) {
  const handler = require(`../${file}`);
  if (typeof handler !== 'function') throw new Error(`${file}: handler is not a function`);
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await handler({ method: 'GET', query: {}, headers: {}, body: {} }, res);
  if (res.statusCode !== 410 || res.body?.errorCode !== 'LEGACY_API_DISABLED') {
    throw new Error(`${file}: production guard failed`);
  }
}
const sensitiveLegacySources = [
  'api/otp/[action].js',
  'api/console/[action].js',
].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
if (
  sensitiveLegacySources.includes("process.env.OTP_SALT ||") ||
  sensitiveLegacySources.includes("process.env.CONSOLE_CREDS_SALT ||")
) {
  throw new Error('legacy OTP/console salt fallback must remain dev-only');
}

console.log(`Legacy API production guard passed (${handlers.length} handlers).`);
