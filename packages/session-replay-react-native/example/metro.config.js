const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const projectRoot = __dirname;
const packageRoot = path.resolve(projectRoot, '..');
const escapedPackageRoot = packageRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  watchFolders: [packageRoot],
  resolver: {
    blockList: [new RegExp(`${escapedPackageRoot}/lib/.*`)],
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
    resolveRequest: (context, moduleName, platform) => {
      const resolution = context.resolveRequest(context, moduleName, platform);
      const libSegment = `${path.sep}session-replay-react-native${path.sep}lib${path.sep}`;
      if (resolution?.filePath?.includes(libSegment)) {
        const srcPath = resolution.filePath
          .replace(`${path.sep}lib${path.sep}module${path.sep}`, `${path.sep}src${path.sep}`)
          .replace(`${path.sep}lib${path.sep}commonjs${path.sep}`, `${path.sep}src${path.sep}`)
          .replace(/\.js$/, '.ts')
          .replace(/\.jsx$/, '.tsx');
        return { filePath: srcPath, type: 'sourceFile' };
      }
      if (moduleName === '@amplitude/session-replay-react-native') {
        return {
          filePath: path.join(packageRoot, 'src/index.tsx'),
          type: 'sourceFile',
        };
      }
      return resolution;
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
