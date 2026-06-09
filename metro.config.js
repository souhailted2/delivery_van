/**
 * Workspace-root metro.config.js
 *
 * Expo CLI detects pnpm-workspace.yaml and treats the monorepo root as the
 * Metro project root, so it loads this file instead of the one inside the
 * mobile artifact directory.  We configure Metro here with the correct paths
 * so that CI bundling works even though the Expo project lives in a
 * sub-directory.
 */
const path = require("path");

const mobileRoot = path.resolve(__dirname, "artifacts/erp-van-sales-mobile");

// expo/metro-config is only a dependency of the mobile artifact.
// Require it from the artifact's own node_modules to avoid a "module not
// found" error at the workspace root.
const { getDefaultConfig } = require(
  path.join(mobileRoot, "node_modules/expo/metro-config")
);

const config = getDefaultConfig(mobileRoot);

// Force Metro to treat the mobile artifact directory as the real project root.
config.projectRoot = mobileRoot;

// Watch the full monorepo root so Metro can reach files in the pnpm virtual
// store (node_modules/.pnpm/…) and in shared libs.
config.watchFolders = [
  __dirname,
  path.resolve(__dirname, "lib"),
];

// Resolve modules from the artifact's own node_modules first, then fall back
// to the workspace-root virtual store.
config.resolver.nodeModulesPaths = [
  path.join(mobileRoot, "node_modules"),
  path.join(__dirname, "node_modules"),
];

// Prevent hierarchical node_modules lookup from picking up wrong copies in a
// pnpm monorepo.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
