const path = require('path');

const nativePackages = [
  '@amplitude/analytics-react-native',
  '@amplitude/experiment-react-native-client',
  '@amplitude/plugin-engagement-react-native',
  '@amplitude/plugin-session-replay-react-native',
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

module.exports = { dependencies };
