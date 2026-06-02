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
// `packages/analytics-react-native` pins its own react-native devDep; force the app's copy.
config.resolver.extraNodeModules = {
  'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
  react: path.resolve(projectRoot, 'node_modules/react'),
};

module.exports = config;
