const baseConfig = require('../../jest.config.js');
const package = require('./package');

module.exports = {
  ...baseConfig,
  displayName: package.name,
  setupFiles: ['./test/setup.js'],
  rootDir: '.',
  testEnvironment: 'node',
};
