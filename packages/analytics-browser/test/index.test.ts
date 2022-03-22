import { init, track, setUserId, setDeviceId, setSessionId } from '../src/index';

describe('index', () => {
  test('should expose apis', () => {
    expect(typeof init).toBe('function');
    expect(typeof track).toBe('function');
    expect(typeof setUserId).toBe('function');
    expect(typeof setDeviceId).toBe('function');
    expect(typeof setSessionId).toBe('function');
  });
});
