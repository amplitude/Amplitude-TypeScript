const baseConfig = require('../../jest.config.js');
const package = require('./package');
const structedClone = require('@ungap/structured-clone');

module.exports = {
  ...baseConfig,
  displayName: package.name,
  rootDir: '.',
  testEnvironment: 'jsdom',
  coveragePathIgnorePatterns: ['index.ts'],
  setupFiles: ['fake-indexeddb/auto'],
  globals: {
    structuredClone: structuredClone,
  },
};
