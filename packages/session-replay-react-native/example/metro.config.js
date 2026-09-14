const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const projectRoot = __dirname;
const packageRoot = path.resolve(projectRoot, '..');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  watchFolders: [packageRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(packageRoot, 'node_modules'),
    ],
    extraNodeModules: {
      '@amplitude/session-replay-react-native': packageRoot,
      '@amplitude/analytics-types': path.resolve(
        packageRoot,
        'node_modules/@amplitude/analytics-types',
      ),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
