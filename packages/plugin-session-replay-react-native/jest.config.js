const baseConfig = require('../../jest.config.js');
const package = require('./package');

module.exports = {
  ...baseConfig,
  displayName: package.name,
  rootDir: '.',
  preset: 'react-native',
  testEnvironment: 'jsdom',
  modulePathIgnorePatterns: [
    "<rootDir>/lib/"
  ],
  testPathIgnorePatterns: [
    ...(baseConfig.testPathIgnorePatterns || []),
    '<rootDir>/example/',
  ],
  moduleFileExtensions: ['tsx', 'ts', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    // Resolve the standalone package to its TypeScript source so the plugin's
    // tests exercise the current source of truth rather than a previously built
    // `lib/` artifact.
    '^@amplitude/session-replay-react-native$': '<rootDir>/../session-replay-react-native/src/index',
    // Reuse the standalone package's `react-native` mock instead of duplicating
    // it (SDKRN-14). The plugin delegates to the standalone, which is the only
    // package that talks to the native `AMPNativeSessionReplay` module and the
    // `AMPMaskComponentView`, so the standalone owns the single canonical mock.
    // This maps every bare `react-native` import (plugin + standalone source and
    // the tests) to that shared mock, removing the need for per-file
    // `jest.mock('react-native')` calls and a duplicated `__mocks__` fixture.
    '^react-native$': '<rootDir>/../session-replay-react-native/test/__mocks__/react-native',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(.pnpm|@react-native|react-native|@segment)/)',
  ],
  // TODO: get full coverage
  coverageThreshold: {
    global: {
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0,
    }
  },
};
