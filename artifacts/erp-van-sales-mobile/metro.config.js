const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Keep projectRoot scoped to the mobile artifact.
config.projectRoot = projectRoot;

// Watch the artifact folder, shared libs, AND the workspace node_modules.
// The last entry is critical for pnpm monorepos: Expo CLI resolves
// expo-router/entry to its realpath inside workspaceRoot/node_modules/.pnpm/.
// Without watching workspaceRoot/node_modules, Metro's hasteFS never indexes
// those realpath entries and throws "Unable to resolve module … from …".
config.watchFolders = [
  projectRoot,
  path.resolve(workspaceRoot, "lib"),
  path.join(workspaceRoot, "node_modules"),
];

// Tell the resolver where to find modules: local first, then workspace root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Required for pnpm monorepos: treat symlinks as-is without resolving to
// real paths. Metro then follows symlinks into the pnpm virtual store and
// uses hierarchical lookup within the store to find peer deps correctly.
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
