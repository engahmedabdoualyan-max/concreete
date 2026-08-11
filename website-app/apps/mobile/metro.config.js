/**
 * Fimto Concrete ERP — Mobile (Expo) in the unified Monorepo.
 * ─────────────────────────────────────────────────────────────
 * The mobile app now lives at website-app/apps/mobile. Metro must
 * resolve packages both from the app's own node_modules and the
 * monorepo root (website-app/node_modules) so it works whether or
 * not dependencies are hoisted by npm workspaces.
 */

const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const monorepoRoot = path.resolve(__dirname, "../..");

const config = getDefaultConfig(__dirname);

config.watchFolders = [__dirname, monorepoRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

module.exports = withNativeWind(config, { input: "./global.css" });
