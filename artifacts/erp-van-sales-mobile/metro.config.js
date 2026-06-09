const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Only watch the artifact folder and the shared libs — avoids Metro scanning
// the entire monorepo node_modules tree on startup (cuts startup ~8-12 s).
config.watchFolders = [
  projectRoot,
  path.resolve(workspaceRoot, "lib"),
];

// Tell the resolver where to find modules: local first, then workspace root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Required for pnpm monorepos: prevents Metro from walking up the tree
// and picking up wrong module copies from ancestor node_modules directories.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
