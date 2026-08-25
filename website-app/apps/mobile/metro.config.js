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
const npmRoot = path.resolve(__dirname, "../../..");

const config = getDefaultConfig(__dirname);

config.watchFolders = [__dirname, monorepoRoot, npmRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// The npm root may hold a different react-native major version, so it is NOT
// added to nodeModulesPaths (that would shadow the app's RN). Instead, only
// map packages that npm workspaces hoisted to the real workspace root and are
// absent from the app's own node_modules (symlinked into node_modules above).
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  "expo-av": path.resolve(npmRoot, "node_modules/expo-av"),
  // expo-av (hoisted to npmRoot) would resolve react-native to the npmRoot's
  // own copy; force it back to the app's react-native so Metro bundles it with
  // the correct version.
  "react-native": path.resolve(__dirname, "node_modules/react-native"),
};

module.exports = withNativeWind(config, { input: "./global.css" });
