// __mocks__/logger.ts

// Create mock functions for each log level
const mockDebug = jest.fn();
const mockWarn = jest.fn();
const mockError = jest.fn();
const mockLog = jest.fn();
const mockSetLogLevel = jest.fn();

const mockLogger = {
  debug: mockDebug,
  log: mockLog,
  warn: mockWarn,
  error: mockError,
  setLogLevel: mockSetLogLevel,
};

export const createSessionReplayLogger = jest.fn(() => {
  return mockLogger;
});
