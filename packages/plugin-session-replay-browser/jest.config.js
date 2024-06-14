const baseConfig = require('../../jest.config.js');
const package = require('./package');

module.exports = {
  ...baseConfig,
  transform: {
    ...baseConfig.transform,
    '\\.[jt]sx?$': ['babel-jest', { plugins: ['@babel/plugin-transform-modules-commonjs'] }], // needed for @medv/finder
  },
  transformIgnorePatterns: [`../../node_modules/(?!@medv)`],
  displayName: package.name,
  rootDir: '.',
  testEnvironment: 'jsdom',
  coveragePathIgnorePatterns: ['index.ts'],
};
