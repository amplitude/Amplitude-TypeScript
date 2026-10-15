const path = require('path');
const android = require('@react-native-community/cli-platform-android');

// pnpm can nest native modules under .pnpm/, where RN autolinking does not
// walk. Pin the package roots so RNCAsyncStorage (and the SDK's native
// module) are linked on both iOS and Android.
const nativePackages = [
  '@amplitude/analytics-react-native',
  '@react-native-async-storage/async-storage',
];

const dependencies = Object.fromEntries(
  nativePackages.map((packageName) => [
    packageName,
    {
      root: path.dirname(require.resolve(`${packageName}/package.json`)),
    },
  ]),
);

module.exports = {
  commands: android.commands,
  platforms: {
    android: {
      projectConfig: android.projectConfig,
      dependencyConfig: android.dependencyConfig,
    },
  },
  dependencies,
};
