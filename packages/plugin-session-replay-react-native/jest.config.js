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
  // Resolve the standalone package to its TypeScript source so the plugin's
  // tests exercise the current source of truth rather than a previously built
  // `lib/` artifact.
  moduleNameMapper: {
    '^@amplitude/session-replay-react-native$': '<rootDir>/../session-replay-react-native/src/index',
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
