const baseConfig = require('../../jest.config.js');

module.exports = {
  ...baseConfig,
  displayName: '@amplitude/gtm-snippet',
  rootDir: '.',
  testEnvironment: 'jsdom',
};
