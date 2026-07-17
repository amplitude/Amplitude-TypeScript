/**
 * Jest config for on-device React Native Harness tests.
 * Used automatically by `react-native-harness` when present in cwd.
 *
 * Element-interaction tests need `@react-native-harness/ui` (TurboModule-only),
 * so they are skipped when NEW_ARCH is not enabled.
 */
const isNewArch = ['1', 'true', 'on', 'yes'].includes(
  (process.env.NEW_ARCH ?? '0').trim().toLowerCase(),
);

export default {
  preset: 'react-native-harness',
  testMatch: ['<rootDir>/test/**/*.harness.[jt]s?(x)'],
  testPathIgnorePatterns: [
    '/node_modules/',
    ...(isNewArch ? [] : ['element-interactions\\.harness\\.[jt]sx?$']),
  ],
};
