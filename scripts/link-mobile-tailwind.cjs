/**
 * EAS runs npm from the monorepo root. The website uses Tailwind 4, while
 * NativeWind 4 requires Tailwind 3. Keep both versions side by side and make
 * NativeWind resolve its own v3 copy without changing the website toolchain.
 */
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const nativewindCandidates = [
  path.join(root, "node_modules", "nativewind"),
  path.join(root, "website-app", "node_modules", "nativewind"),
  path.join(root, "website-app", "apps", "mobile", "node_modules", "nativewind"),
];
const tailwindCandidates = [
  path.join(root, "node_modules", "tailwindcss-v3"),
  path.join(root, "website-app", "node_modules", "tailwindcss-v3"),
  path.join(root, "website-app", "apps", "mobile", "node_modules", "tailwindcss-v3"),
];

const nativewind = nativewindCandidates.find((candidate) => fs.existsSync(candidate));
const tailwind = tailwindCandidates.find((candidate) => fs.existsSync(candidate));

if (nativewind && tailwind) {
  const nodeModules = path.join(nativewind, "node_modules");
  const target = path.join(nodeModules, "tailwindcss");
  fs.mkdirSync(nodeModules, { recursive: true });
  if (!fs.existsSync(target)) {
    fs.symlinkSync(path.relative(nodeModules, tailwind), target, "junction");
  }
}
