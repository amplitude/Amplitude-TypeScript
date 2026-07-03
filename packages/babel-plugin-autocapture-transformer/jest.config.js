const baseConfig = require('../../jest.config.js');
const package = require('./package');

module.exports = {
  ...baseConfig,
  displayName: package.name,
  rootDir: '.',
  testEnvironment: 'node',
  coverageThreshold: undefined,
  testPathIgnorePatterns: [...(baseConfig.testPathIgnorePatterns || ['/node_modules/']), '/lib/'],
  modulePathIgnorePatterns: [...(baseConfig.modulePathIgnorePatterns || []), '/lib/'],
};
