const baseConfig = require('../../jest.config.js');
const package = require('./package');

module.exports = {
  ...baseConfig,
  displayName: package.name,
  rootDir: '.',
  preset: 'react-native',
  testEnvironment: 'jsdom',
  watchman: false,
  coveragePathIgnorePatterns: ['index.ts'],
  modulePathIgnorePatterns: ['<rootDir>/lib/'],
  moduleFileExtensions: ['tsx', 'ts', 'js', 'jsx', 'json'],
  transformIgnorePatterns: ['node_modules/(?!(.pnpm|@react-native|react-native)/)'],
};
