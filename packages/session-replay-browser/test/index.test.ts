import { getSessionReplayProperties, init, setSessionId, shutdown } from '../src/index';

describe('index', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Mock console.error to prevent test failures in CI when errors are logged
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {
      // Suppress console.error output during tests
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test('should expose apis', () => {
    expect(typeof init).toBe('function');
    expect(typeof setSessionId).toBe('function');
    expect(typeof getSessionReplayProperties).toBe('function');
    expect(typeof shutdown).toBe('function');
  });
});
