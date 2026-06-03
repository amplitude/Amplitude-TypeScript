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
];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

// Force a SINGLE copy of react-native / react for the whole bundle.
//
// `packages/analytics-react-native` pins its own `react-native` devDep (0.70.6),
// so Metro resolves the workspace-linked SDK's `react-native` imports to that
// NESTED copy — a second react-native in the bundle alongside the app's 0.71.x.
// A duplicate react-native means a duplicate `RCTDeviceEventEmitter` singleton:
// the native bridge emits connectivity events on the APP's emitter, but the SDK's
// `NativeEventEmitter` listener is registered on the duplicate's emitter, so the
// SDK never receives `AmplitudeNetworkConnectivityChanged` events and offline mode
// only ever sees the initial seed (never live changes). `extraNodeModules` is just
// a resolution *fallback* and doesn't override the nested copy, so redirect
// explicitly via `resolveRequest`.
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
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
