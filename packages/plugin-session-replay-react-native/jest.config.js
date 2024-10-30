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
