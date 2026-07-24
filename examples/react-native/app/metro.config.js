const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const fs = require('fs');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../../..');
// realpath into the pnpm virtual store so RN transitive deps (memoize-one, etc.)
// resolve as siblings under .pnpm/react-native@…/node_modules/.
const projectReactNative = fs.realpathSync(
  path.resolve(projectRoot, 'node_modules/react-native'),
);
const projectReact = fs.realpathSync(
  path.resolve(projectRoot, 'node_modules/react'),
);
const pnpmRnNodeModules = path.dirname(projectReactNative);
const pnpmStore = path.resolve(workspaceRoot, 'node_modules/.pnpm');

const defaultConfig = getDefaultConfig(projectRoot);

// Force a single copy of react-native / react across the bundle.
// Mirrors the expo-app dedup from PR #1803.
const forcedSingletons = {
  'react-native': projectReactNative,
  react: projectReact,
};

const resolveWithNode = (context, moduleName) => {
  if (
    typeof moduleName !== 'string' ||
    moduleName.startsWith('.') ||
    path.isAbsolute(moduleName)
  ) {
    return null;
  }
  try {
    const filePath = fs.realpathSync(
      require.resolve(moduleName, {
        paths: [
          path.dirname(context.originModulePath),
          pnpmRnNodeModules,
          projectReactNative,
          projectRoot,
          workspaceRoot,
        ],
      }),
    );
    return {type: 'sourceFile', filePath};
  } catch {
    return null;
  }
};

const config = {
  // Prefer the Node crawler: watchman repeatedly recrawls this monorepo and
  // drops pnpm-store entries (SHA-1 / resolve failures for memoize-one, etc.).
  watchFolders: [
    path.join(workspaceRoot, 'packages/analytics-react-native'),
    path.join(workspaceRoot, 'packages/analytics-core'),
    // Pulled in via analytics-react-native autocapture.networkTracking.
    path.join(workspaceRoot, 'packages/plugin-network-capture-browser'),
    pnpmStore,
  ],
  resolver: {
    useWatchman: false,
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      pnpmRnNodeModules,
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    extraNodeModules: forcedSingletons,
    resolveRequest: (context, moduleName, platform) => {
      for (const [name, dir] of Object.entries(forcedSingletons)) {
        if (moduleName === name || moduleName.startsWith(name + '/')) {
          const target = path.join(dir, moduleName.slice(name.length));
          return context.resolveRequest(context, target, platform);
        }
      }
      try {
        return context.resolveRequest(context, moduleName, platform);
      } catch (error) {
        const resolved = resolveWithNode(context, moduleName);
        if (resolved) {
          return resolved;
        }
        throw error;
      }
    },
  },
};

module.exports = mergeConfig(defaultConfig, config);
