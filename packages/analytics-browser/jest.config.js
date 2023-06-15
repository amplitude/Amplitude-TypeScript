const baseConfig = require('../../jest.config.js');
const package = require('./package');

module.exports = {
  ...baseConfig,
  displayName: package.name,
  setupFiles: ['./test/setup.js'],
  rootDir: '.',
  testEnvironment: 'jsdom',
  coveragePathIgnorePatterns: ['snippet-index.ts', 'global-scope.ts'],
};
