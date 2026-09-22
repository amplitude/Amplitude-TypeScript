const baseConfig = require('../../jest.config.js');
const package = require('./package');

module.exports = {
  ...baseConfig,
  displayName: package.name,
  rootDir: '.',
  preset: 'react-native',
  testEnvironment: 'jsdom',
  moduleFileExtensions: ['tsx', 'ts', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$': '<rootDir>/test/mock/async-storage.ts',
  },
  transformIgnorePatterns: ['node_modules/(?!(.pnpm|@react-native|react-native|@amplitude)/)'],
  coveragePathIgnorePatterns: ['index.ts', 'version.ts'],
};
