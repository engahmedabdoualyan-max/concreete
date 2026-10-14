const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

// Vercel installs the website workspace, not the native mobile project.
// Keep its install side-effect free; EAS needs the patch-package step.
if (process.env.VERCEL) process.exit(0);

const root = process.cwd();
const mobile = path.join(root, "website-app", "apps", "mobile");
const patchDir = path.join(root, "website-app", "apps", "mobile", "patches");

// An API-only install (Render, or any partial workspace install) has neither the
// mobile app's node_modules nor patch-package itself. The mobile patches are not
// needed to build or run the API, so skip instead of failing the whole install.
const skip = (reason) => {
  console.log(`[apply-mobile-patches] skipped: ${reason}`);
  process.exit(0);
};

if (!fs.existsSync(mobile)) skip("website-app/apps/mobile is not part of this install");
if (!fs.existsSync(patchDir)) skip("no patches directory");

let patchPackageBin;
try {
  patchPackageBin = require.resolve("patch-package");
} catch {
  skip("patch-package is not installed (mobile app not part of this install)");
}
if (!fs.existsSync(path.join(mobile, "node_modules")))
  skip("mobile node_modules is not installed");

const result = spawnSync(process.execPath, [patchPackageBin, "--patch-dir", patchDir], {
  cwd: root,
  stdio: "inherit",
});
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
