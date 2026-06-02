const baseConfig = require('../../jest.config.js');
const package = require('./package');

module.exports = {
  ...baseConfig,
  displayName: package.name,
  rootDir: '.',
  testEnvironment: 'jsdom',
  // Scaffolding only — coverage gates land alongside the algorithm in subsequent tickets.
  coverageThreshold: undefined,
};
