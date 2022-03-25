import {
  add,
  groupIdentify,
  Identify,
  identify,
  init,
  logEvent,
  remove,
  Revenue,
  revenue,
  setDeviceId,
  setSessionId,
  setUserId,
  track,
  runQueuedFunctions,
} from '../src/index';

describe('index', () => {
  test('should expose apis', () => {
    expect(typeof add).toBe('function');
    expect(typeof groupIdentify).toBe('function');
    expect(typeof Identify).toBe('function');
    expect(typeof identify).toBe('function');
    expect(typeof init).toBe('function');
    expect(typeof logEvent).toBe('function');
    expect(typeof remove).toBe('function');
    expect(typeof Revenue).toBe('function');
    expect(typeof revenue).toBe('function');
    expect(typeof runQueuedFunctions).toBe('function');
    expect(typeof setDeviceId).toBe('function');
    expect(typeof setSessionId).toBe('function');
    expect(typeof setUserId).toBe('function');
    expect(typeof track).toBe('function');
  });
});
