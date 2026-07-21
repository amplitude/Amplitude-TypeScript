// Learn more https://docs.expo.io/guides/customizing-metro
const {getDefaultConfig} = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '../../..');
const packagesRoot = path.join(repoRoot, 'packages');

const config = getDefaultConfig(projectRoot);

// Workspace-linked SDK lives under packages/; Metro must watch those paths (not the
// whole monorepo, which triggers Haste collisions across unrelated packages).
config.watchFolders = [
  path.join(packagesRoot, 'analytics-react-native'),
  path.join(packagesRoot, 'analytics-core'),
  path.join(packagesRoot, 'plugin-page-view-tracking-browser'),
  path.join(packagesRoot, 'plugin-network-capture-browser'),
];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

// Force a single copy of react-native / react across the bundle. The SDK pins
// its own react-native devDep, so Metro would otherwise resolve the workspace-
// linked SDK's imports to that nested copy and bundle two react-natives (two
// RCTDeviceEventEmitter singletons, so the SDK misses connectivity events).
// extraNodeModules is only a fallback and won't override the nested copy, so
// redirect explicitly via resolveRequest.
const forcedSingletons = {
  'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
  react: path.resolve(projectRoot, 'node_modules/react'),
};
config.resolver.extraNodeModules = forcedSingletons;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  for (const [name, dir] of Object.entries(forcedSingletons)) {
    if (moduleName === name || moduleName.startsWith(name + '/')) {
      const target = path.join(dir, moduleName.slice(name.length));
      return context.resolveRequest(context, target, platform);
    }
  }
  // Symbolication stack frames for watchFolder packages use repo-root-relative
  // paths (e.g. ./packages/analytics-core/lib/cjs/logger). Resolve those from
  // the monorepo root instead of the Expo project root.
  const monorepoRelative = moduleName.replace(/^\.\//, '');
  if (monorepoRelative.startsWith('packages/')) {
    return context.resolveRequest(context, path.join(repoRoot, monorepoRelative), platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
