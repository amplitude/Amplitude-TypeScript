const baseConfig = require('../../jest.config.js');
const package = require('./package');

module.exports = {
  ...baseConfig,
  collectCoverage: false,
  displayName: package.name,
  rootDir: '.',
  testEnvironment: 'node',
};
