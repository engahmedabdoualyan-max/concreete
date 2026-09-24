#!/usr/bin/env node
/** Lightweight static guard for the checked-in Firestore rulesets. */
import { readFileSync } from 'node:fs';

const files = ['firestore.rules', 'website-app/firestore.rules'];
const failures = [];
for (const file of files) {
  const source = readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '');
  if (/allow\s+(read|write)[^:]*:\s*if\s+true\b/i.test(source)) {
    failures.push(`${file}: unconditional allow rule`);
  }
  if (/allow\s+(read|write)[^:]*:\s*if\s+request\.auth\s*!=\s*null\s*;?/i.test(source)) {
    failures.push(`${file}: auth-only allow rule (custom tenant claims required)`);
  }
  if (!/function\s+sameTenant\s*\(/.test(source)) {
    failures.push(`${file}: missing sameTenant helper`);
  }
  if (!/sign_in_provider\s*!=\s*['"]anonymous['"]/.test(source)) {
    failures.push(`${file}: anonymous Firebase access is not explicitly denied`);
  }
  const usersBlock = source.match(/match \/users\/\{username\}\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
  if (!/allow read, write:\s*if isAdmin\(\)/.test(usersBlock)) {
    failures.push(`${file}: users collection is not admin/server-only`);
  }
}
const supabaseSchema = readFileSync('supabase/schema.sql', 'utf8').replace(/--.*$/gm, '');
if (/using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)/i.test(supabaseSchema)) {
  failures.push('supabase/schema.sql: public CRUD policy remains');
}
if (/admin123/i.test(supabaseSchema)) {
  failures.push('supabase/schema.sql: default admin password remains');
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}
console.log(`Firestore/Supabase rules static audit passed (${files.length} Firestore rulesets).`);
