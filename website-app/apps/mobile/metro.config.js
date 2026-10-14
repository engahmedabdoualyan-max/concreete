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
//
// WEB EXPORT EXCEPTION: on web `react-native` MUST resolve to
// `react-native-web` (Expo's web alias). Forcing the real RN copy breaks web
// bundling (missing Platform.js etc.), so the override flips. Detected via
// env (set by the `export:web` npm script) or via the expo export CLI argv
// itself, so Windows CI (no Bourne env syntax) works too.
const _argv = process.argv.join(" ");
const isWebExport =
  process.env.FIMTO_WEB_EXPORT === "1" ||
  (_argv.includes("export") && _argv.includes("--platform web"));
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  "expo-av": path.resolve(npmRoot, "node_modules/expo-av"),
  // expo-av (hoisted to npmRoot) would resolve react-native to the npmRoot's
  // own copy; force it back to the app's react-native so Metro bundles it with
  // the correct version.
  "react-native": isWebExport
    ? path.resolve(npmRoot, "node_modules/react-native-web")
    : path.resolve(__dirname, "node_modules/react-native"),
};


// WEB EXPORT: authoritative redirect — any bare or deep `react-native`
// import on web resolves into react-native-web (diagnostic attempt).
if (isWebExport) {
  const webPkg = path.resolve(npmRoot, "node_modules/react-native-web/package.json");
  const prevResolveRequest =
    typeof config.resolver.resolveRequest === "function"
      ? config.resolver.resolveRequest.bind(config.resolver)
      : null;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (platform === "web" && (moduleName === "react-native" || moduleName.startsWith("react-native/"))) {
      try {
        return {
          filePath: require.resolve("react-native-web", { paths: [npmRoot] }),
          type: "sourceFile",
        };
      } catch {}
    }
    if (prevResolveRequest) return prevResolveRequest(context, moduleName, platform);
    return context.resolveRequest(context, moduleName, platform);
  };
  void webPkg;
}

module.exports = withNativeWind(config, { input: "./global.css" });
