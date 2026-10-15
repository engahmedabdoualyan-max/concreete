#!/usr/bin/env node
/**
 * Website i18n key check: every t('key') / d('key') used alongside a
 * useXxxDict() hook must exist in that hook's DICT. Unknown keys render
 * as the raw key string at runtime (silent UI bug), so they fail here.
 *
 * Run: node scripts/i18n-key-check.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SRC = path.join(ROOT, "website-app", "src");

const dictOf = {}; // hookName -> { file, keys:Set }
for (const f of fs.readdirSync(path.join(SRC, "i18n"))) {
  if (!f.endsWith("Dict.ts")) continue;
  const src = fs.readFileSync(path.join(SRC, "i18n", f), "utf8");
  const hook = (src.match(/export function (use\w+)\(\)/) || [])[1];
  if (!hook) continue;
  const keys = new Set([...src.matchAll(/^\s{2}([A-Za-z0-9_]+):\s*(?:\{|ar\()/gm)].map((m) => m[1]));
  dictOf[hook] = { file: f, keys };
}

const failures = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules") walk(full);
    } else if (/\.(tsx?)$/.test(e.name)) {
      check(full);
    }
  }
};

function check(file) {
  const src = fs.readFileSync(file, "utf8");
  const hooks = [...src.matchAll(/const (\w+) = (use\w+Dict)\(\)/g)];
  if (!hooks.length) return;
  const rel = path.relative(SRC, file);
  for (const [, local, hook] of hooks) {
    let dict = dictOf[hook];
    if (!dict) {
      // Hook + DICT defined locally inside the component file.
      const localKeys = new Set(
        [...src.matchAll(/^\s{2}([A-Za-z0-9_]+):\s*(?:\{|ar\()/gm)].map((m) => m[1])
      );
      if (localKeys.size) dict = { file: `${rel} (local)`, keys: localKeys };
    }
    if (!dict) {
      failures.push(`${rel}: unknown dict hook ${hook}()`);
      continue;
    }
    const used = new Set([...src.matchAll(new RegExp(`(?<![A-Za-z0-9_$.])${local}\\('([A-Za-z0-9_]+)'\\)`, "g"))].map((m) => m[1]));
    for (const k of used) {
      if (!dict.keys.has(k)) failures.push(`${rel}: ${local}('${k}') missing from ${dict.file}`);
    }
  }
}

walk(path.join(SRC, "pages"));
walk(path.join(SRC, "components"));
walk(path.join(SRC, "context"));

if (failures.length) {
  console.error(`i18n key check FAILED (${failures.length}):`);
  for (const f of failures.slice(0, 40)) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`i18n key check passed (${Object.keys(dictOf).length} dicts).`);
