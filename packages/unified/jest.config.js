const baseConfig = require('../../jest.config.js');
const package = require('./package');

module.exports = {
  ...baseConfig,
  displayName: package.name,
  rootDir: '.',
  testEnvironment: 'jsdom',
  coveragePathIgnorePatterns: ['index.ts'],
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 85,
      lines: 95,
      statements: 95,
    }
  },
};
