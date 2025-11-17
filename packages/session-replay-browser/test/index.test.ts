import { getSessionReplayProperties, init, setSessionId, shutdown } from '../src/index';

describe('index', () => {
  test('should expose apis', () => {
    expect(typeof init).toBe('function');
    expect(typeof setSessionId).toBe('function');
    expect(typeof getSessionReplayProperties).toBe('function');
    expect(typeof shutdown).toBe('function');
  });
});
