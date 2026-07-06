const baseConfig = require('../../jest.config.js');
const package = require('./package');

module.exports = {
  ...baseConfig,
  displayName: package.name,
  rootDir: '.',
  testEnvironment: 'jsdom',
  // Scaffolding only — coverage gates land alongside the algorithm in subsequent tickets.
  coverageThreshold: undefined,
  // Never walk into the testbed — it's a local dev tool, not part of the
  // package's test suite or shipped artifact.
  testPathIgnorePatterns: [...(baseConfig.testPathIgnorePatterns || ['/node_modules/']), '/testbed/', '/lib/'],
  modulePathIgnorePatterns: [...(baseConfig.modulePathIgnorePatterns || []), '/testbed/', '/lib/'],
};
