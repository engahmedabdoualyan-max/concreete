const { spawnSync } = require("node:child_process");
const path = require("node:path");

// Vercel installs the website workspace, not the native mobile project.
// Keep its install side-effect free; EAS needs the patch-package step.
if (process.env.VERCEL) process.exit(0);

const root = process.cwd();
const mobile = path.join(root, "website-app", "apps", "mobile");
const patchDir = path.join("website-app", "apps", "mobile", "patches");
const result = spawnSync(
  process.execPath,
  [require.resolve("patch-package"), "--patch-dir", patchDir],
  { cwd: root, stdio: "inherit" }
);
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
