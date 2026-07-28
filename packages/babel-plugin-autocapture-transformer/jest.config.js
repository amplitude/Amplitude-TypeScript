const baseConfig = require('../../jest.config.js');
const package = require('./package');

module.exports = {
  ...baseConfig,
  displayName: package.name,
  rootDir: '.',
  testEnvironment: 'node',
  collectCoverageFrom: ['src/**/*.ts'],
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
  testPathIgnorePatterns: [...(baseConfig.testPathIgnorePatterns || ['/node_modules/']), '/lib/'],
  modulePathIgnorePatterns: [...(baseConfig.modulePathIgnorePatterns || []), '/lib/'],
};
