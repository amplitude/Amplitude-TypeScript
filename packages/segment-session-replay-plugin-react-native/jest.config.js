const baseConfig = require('../../jest.config.js');
const package = require('./package');

module.exports = {
  ...baseConfig,
  displayName: package.name,
  rootDir: '.',
  preset: 'react-native',
  testEnvironment: 'jsdom',
  modulePathIgnorePatterns: ['<rootDir>/lib/'],
  moduleFileExtensions: ['tsx', 'ts', 'js', 'jsx', 'json'],
  transformIgnorePatterns: [
    'node_modules/(?!(.pnpm|@react-native|react-native|@segment)/)',
  ],
  // TODO do 100% coverage
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
