/**
 * Jest config for on-device React Native Harness tests.
 * Used automatically by `react-native-harness` when present in cwd.
 */
export default {
  preset: 'react-native-harness',
  testMatch: ['<rootDir>/test/**/*.harness.[jt]s?(x)'],
};
