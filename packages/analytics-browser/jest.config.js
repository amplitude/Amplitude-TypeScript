const baseConfig = require('../../jest.config.js');
const package = require('./package');

module.exports = {
  ...baseConfig,
  displayName: package.name,
  rootDir: '.',
  testEnvironment: 'jsdom',
  coveragePathIgnorePatterns: ['browser-snippet.ts'],
};
