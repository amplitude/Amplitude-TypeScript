module.exports = {
  preset: 'ts-jest',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverage: true,
  collectCoverageFrom: ['**/src/**/*.ts'],
  coverageReporters: ['lcov', 'text-summary'],
  restoreMocks: true,
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    }
  },
  verbose: true,
  modulePathIgnorePatterns: ['<rootDir>/lib']
};
