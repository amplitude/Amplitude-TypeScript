const fs = require('fs');
const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const hostAppRoot = path.resolve(workspaceRoot, 'examples/react-native/app');
// realpath into the pnpm virtual store so RN transitive deps resolve as
// siblings under .pnpm/react-native@…/node_modules/ (not next to the app symlink).
const hostReactNative = fs.realpathSync(
  path.resolve(hostAppRoot, 'node_modules/react-native'),
);
const hostReact = fs.realpathSync(
  path.resolve(hostAppRoot, 'node_modules/react'),
);
const hostPnpmNodeModules = path.dirname(hostReactNative);
const pnpmStore = path.resolve(workspaceRoot, 'node_modules/.pnpm');

const forcedSingletons = {
  'react-native': hostReactNative,
  react: hostReact,
};

/**
 * Resolve a bare package via Node (understands pnpm symlinks), returning the
 * realpath so Metro's file map (which indexes .pnpm) can SHA-1 it.
 */
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
          hostPnpmNodeModules,
          hostReactNative,
          hostAppRoot,
          projectRoot,
          workspaceRoot,
        ],
      }),
    );
    return { type: 'sourceFile', filePath };
  } catch {
    return null;
  }
};

/**
 * Harness runs Metro from this package, but the host binary and SDK live elsewhere
 * in the monorepo.
 *
 * - Package exports: required for @react-native-harness/* subpaths (bridge/client).
 * - Forced react/react-native: realpath into the host app's pnpm store.
 * - Node fallback: Metro's haste map often misses pnpm sibling symlinks; Node can
 *   resolve them, and watchFolders+[pnpmStore] lets Metro SHA-1 the realpath.
 * - useWatchman:false: watchman recrawls this monorepo and drops .pnpm entries.
 * - window polyfill: Hermes needs `window` before RN DebuggingOverlayRegistry loads.
 */
const defaultConfig = getDefaultConfig(projectRoot);

const config = {
  watchFolders: [
    hostAppRoot,
    path.join(workspaceRoot, 'packages/analytics-react-native'),
    path.join(workspaceRoot, 'packages/analytics-core'),
    // Pulled in via analytics-react-native autocapture.networkTracking.
    path.join(workspaceRoot, 'packages/plugin-network-capture-browser'),
    path.join(workspaceRoot, 'packages/analytics-react-native-test'),
    pnpmStore,
  ],
  resolver: {
    useWatchman: false,
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(hostAppRoot, 'node_modules'),
      hostPnpmNodeModules,
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    extraNodeModules: forcedSingletons,
    unstable_enablePackageExports: true,
    unstable_conditionNames: ['react-native', 'require'],
    resolveRequest: (context, moduleName, platform) => {
      for (const [name, dir] of Object.entries(forcedSingletons)) {
        if (moduleName === name || moduleName.startsWith(`${name}/`)) {
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
  serializer: {
    getPolyfills: () => [
      path.join(projectRoot, 'polyfills/window.js'),
      ...(defaultConfig.serializer?.getPolyfills?.() ?? []),
    ],
    getModulesRunBeforeMainModule: () => [
      require.resolve(
        path.join(hostReactNative, 'Libraries/Core/InitializeCore.js'),
      ),
    ],
  },
};

module.exports = mergeConfig(defaultConfig, config);
