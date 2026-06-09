const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Force the correct project root.
// Expo's getDefaultConfig detects pnpm-workspace.yaml and may override
// projectRoot with the monorepo workspace root, causing Metro to resolve
// modules from the wrong directory in CI.
config.projectRoot = projectRoot;

// Watch the artifact folder and shared libs.
config.watchFolders = [
  projectRoot,
  path.resolve(workspaceRoot, "lib"),
];

// Tell the resolver where to find modules: local first, then workspace root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Required for pnpm monorepos: treat symlinks as-is without resolving to
// real paths. Without this, Metro calls realpath() and looks for the module
// in the pnpm virtual store (e.g. node_modules/.pnpm/expo-router@6.x.../),
// which can be missing in CI environments.
config.resolver.unstable_enableSymlinks = true;

// Prevents Metro from walking up the directory tree to find modules
// in ancestor node_modules, which picks up wrong copies in pnpm monorepos.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
