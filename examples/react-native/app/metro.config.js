const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../../..');

const defaultConfig = getDefaultConfig(projectRoot);

// Force a single copy of react-native / react across the bundle.
// Mirrors the expo-app dedup from PR #1803.
const forcedSingletons = {
  'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
  react: path.resolve(projectRoot, 'node_modules/react'),
};

const config = {
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
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
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(defaultConfig, config);
