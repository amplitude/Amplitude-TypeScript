const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../../..');

const defaultConfig = getDefaultConfig(projectRoot);

const config = {
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    // `packages/analytics-react-native` has react-native@0.70.6 as a devDep
    // (its own dev/test target), while this example app uses 0.74.1. Without
    // an alias, Metro's hierarchical lookup would resolve `react-native`
    // imports inside the SDK to the SDK's local copy and bundle two RN
    // versions. Force every `react-native`/`react` import to the app's copy.
    extraNodeModules: {
      'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
      react: path.resolve(projectRoot, 'node_modules/react'),
    },
  },
};

module.exports = mergeConfig(defaultConfig, config);
