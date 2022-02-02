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
};
