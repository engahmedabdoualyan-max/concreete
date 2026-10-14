#!/usr/bin/env node
/**
 * Parse the GPS "Account Inquiry Report" exports into clean, importable rows.
 *
 * Three things have to be right or the imported plates are garbage:
 *
 *  1. LOGICAL ORDER. pdftotext -layout emits Arabic in visual order. -raw emits
 *     it in the PDF's own reading order, which is what the GPS platform
 *     actually stored.
 *
 *  2. NORMALISATION. The PDF contains Arabic PRESENTATION FORMS (U+FE70–U+FEFF,
 *     shaped glyphs like U+FEA7), not base letters (U+062E). A plate stored as
 *     presentation forms will never string-match a plate typed by a human as
 *     normal Arabic, and FIMTO searches and unique-checks both compare strings.
 *     So NFKC is mandatory, not cosmetic.
 *
 *  3. BIDI CONTROLS. U+202B/U+202C embedding marks survive NFKC and swallow the
 *     spaces around them, silently gluing "خلاطه كبير" onto the digits. They are
 *     stripped explicitly.
 *
 * Every plate is also decomposed into a digits part and an Arabic-letter part,
 * because the export mixes a vehicle DESCRIPTION ("خلاطه كبير" = concrete mixer,
 * big) into the plate field. Which part is the real registration is a judgement
 * call for the owner, so both are reported and nothing is guessed here.
 */
import { readFileSync } from 'node:fs';

const BIDI = /[‎‏‪-‮⁦-⁩]/g;

function clean(s) {
  return s
    .normalize('NFKC')
    .replace(BIDI, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parse(file, label) {
  const raw = readFileSync(file, 'utf8');

  // The report states its own row count. Reading it and asserting against it is
  // the only thing that catches a silently dropped vehicle — which happened
  // here: the PDF repeats the column header on page 2 and pdftotext glues it
  // onto the end of the last row, so an end-anchored regex quietly skipped that
  // row and the file looked clean.
  const totalMatch = raw.match(/TOTAL FLEET\s+(\d+)/);
  const declaredTotal = totalMatch ? Number(totalMatch[1]) : null;

  const rows = [];
  for (const line of raw.split('\n')) {
    // Deliberately NOT anchored at the end of the line: a repeated page header
    // can follow the date on the same line. Everything after the expiry date is
    // discarded.
    const m = line.match(/(?:^|\s)(\d{1,2})\s+(.+?)\s+(\d{15})\s+(Yes|No)\s+([\d-]{10})\b/);
    if (!m) continue;
    // Skip the header row's own numbers if they ever line up.
    const plate = clean(m[2]);
    if (!plate || /^(Plate|IMEI|Valid|Expiration)/i.test(plate)) continue;
    const digits = plate.match(/\d+/g) ?? [];
    const letters = plate.match(/[ء-ي]+/g) ?? [];
    rows.push({
      account: label,
      n: Number(m[1]),
      plate,
      regDigits: digits[0] ?? null,
      descWords: letters.join(' '),
      imei: m[3],
      valid: m[4] === 'Yes',
      expiry: m[5],
    });
  }

  if (declaredTotal !== null && rows.length !== declaredTotal) {
    throw new Error(
      `${label}: report declares ${declaredTotal} vehicles but ${rows.length} parsed. ` +
        `Refusing to continue — a silently missing truck is worse than a hard failure.`
    );
  }
  return { rows, declaredTotal };
}

const pa = parse('/tmp/opencode/raw-account_abuseef94@gmail.com.txt', 'abuseef94@gmail.com');
const pb = parse('/tmp/opencode/raw-account_ahm-305@hotmail.com.txt', 'ahm-305@hotmail.com');
const A = pa.rows;
const B = pb.rows;
const all = [...A, ...B];

console.log(`rows: ${A.length} + ${B.length} = ${all.length}`);
console.log(`declared in report: ${pa.declaredTotal} + ${pb.declaredTotal} = ${pa.declaredTotal + pb.declaredTotal}  ✓ counts agree\n`);

// Any presentation forms left would prove NFKC was not applied.
const leftover = all.filter((r) => /[ﭐ-﷿ﹰ-﻿]/.test(r.plate));
console.log(`rows still containing presentation forms: ${leftover.length}`);

const byImei = new Map();
for (const r of all) {
  if (!byImei.has(r.imei)) byImei.set(r.imei, []);
  byImei.get(r.imei).push(r);
}
const dupes = [...byImei.entries()].filter(([, rs]) => rs.length > 1);
console.log(`\nduplicate IMEIs: ${dupes.length}`);
for (const [imei, rs] of dupes) {
  console.log(`  ${imei}`);
  rs.forEach((r) => console.log(`     ${r.account}  #${r.n}  "${r.plate}"  valid=${r.valid}`));
  const plates = new Set(rs.map((r) => r.plate));
  console.log(`     → ${plates.size === 1 ? 'same plate ⇒ one physical vehicle listed twice' : 'DIFFERENT plates ⇒ ambiguous'}`);
}

// Duplicate registration digits, which is what would actually collide on
// fleet_vehicles.plate_number if the digits were used as the plate.
const byDigits = new Map();
for (const r of all) {
  if (!r.regDigits) continue;
  if (!byDigits.has(r.regDigits)) byDigits.set(r.regDigits, []);
  byDigits.get(r.regDigits).push(r);
}
const dupeDigits = [...byDigits.entries()].filter(([, rs]) => rs.length > 1);
console.log(`\nduplicate registration DIGITS: ${dupeDigits.length}`);
for (const [d, rs] of dupeDigits) {
  console.log(`  ${d}:`);
  rs.forEach((r) => console.log(`     ${r.account.padEnd(22)} #${r.n}  "${r.plate}"`));
}

const distinct = new Map();
for (const r of all) if (!byImei.has(r.imei) || byImei.get(r.imei)[0] === r) distinct.set(r.imei, r);

console.log(`\n══ SUMMARY ══`);
console.log(`  rows                 ${all.length}`);
console.log(`  distinct vehicles    ${distinct.size}`);
console.log(`  valid + distinct     ${[...distinct.values()].filter((r) => r.valid).length}`);
console.log(`  expired              ${all.filter((r) => !r.valid).length}`);

console.log(`\n══ TABLE (deduped by IMEI) ══`);
for (const r of distinct.values()) {
  console.log(
    `${r.account.slice(0, 9).padEnd(10)} ${String(r.n).padStart(2)}  ${(r.regDigits ?? '?').padEnd(6)} ${r.descWords.padEnd(18)} ${r.imei}  ${r.valid ? 'valid  ' : 'EXPIRED'} ${r.expiry}`
  );
}

// Emitted for the collision check and the import step. Kept out of the printed
// table so the human-readable output stays readable.
if (process.argv.includes('--json')) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(
    '/tmp/opencode/gps-fleet.json',
    JSON.stringify({ rows: all, distinct: [...distinct.values()] }, null, 2)
  );
  console.log('\nwrote /tmp/opencode/gps-fleet.json');
}