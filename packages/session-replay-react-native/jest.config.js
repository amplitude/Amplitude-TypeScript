const baseConfig = require('../../jest.config.js');
const package = require('./package');

module.exports = {
  ...baseConfig,
  displayName: package.name,
  rootDir: '.',
  preset: 'react-native',
  testEnvironment: 'jsdom',
  modulePathIgnorePatterns: ['<rootDir>/lib/'],
  testPathIgnorePatterns: [...(baseConfig.testPathIgnorePatterns || []), '<rootDir>/example/', '<rootDir>/lib/'],
  moduleFileExtensions: ['tsx', 'ts', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    // The codegen spec imports this deep RN submodule path, which the manual
    // __mocks__/react-native.ts mock does not cover; see the mock for details.
    '^react-native/Libraries/Utilities/codegenNativeComponent$': '<rootDir>/test/__mocks__/codegenNativeComponent.ts',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(.pnpm|@react-native|react-native|@segment)/)',
  ],
  // TODO: get full coverage
  coverageThreshold: {
    global: {
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0,
    },
  },
};
